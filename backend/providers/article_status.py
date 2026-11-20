"""Current public page state, independently of topic inference or edit counting."""

from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from backend.providers.catalog import CatalogProvider
from backend.providers.transport import SourceError, Transport


class CreationLookup(BaseModel):
    revision: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=500)
    page_id: int | None = Field(default=None, gt=0)
    timestamp: datetime
    deleted_page: bool = False

    @field_validator("title")
    @classmethod
    def title_valid(cls, value: str) -> str:
        if any(ord(c) < 32 or c == "|" for c in value):
            raise ValueError("Titre invalide")
        return value

    @field_validator("timestamp")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("Horodatage avec fuseau requis")
        return value


class ArticleStatusRequest(BaseModel):
    project: str = Field(min_length=1, max_length=100)
    creations: list[CreationLookup] = Field(min_length=1, max_length=50)


class ArticleStatusProvider:
    def __init__(self, transport: Transport, catalog: CatalogProvider):
        self.transport = transport
        self.catalog = catalog

    async def pages(self, request: ArticleStatusRequest) -> dict:
        wiki = await self.catalog.resolve(request.project)
        if wiki["family"] != "wikipedia":
            raise ValueError("Un projet Wikipédia est requis")

        async def query(**params):
            data = await self.transport.get(
                f"https://{wiki['domain']}/w/api.php",
                {"action": "query", "format": "json", "formatversion": 2, **params},
                "mediawiki",
            )
            value = data.get("query")
            if not isinstance(value, dict):
                raise SourceError("mediawiki", 502)
            pages = value.get("pages", [])
            if not isinstance(pages, list):
                raise SourceError("mediawiki", 502)
            return value, pages

        _, pages = await query(
            revids="|".join(str(c.revision) for c in request.creations),
            prop="info|pageprops|revisions",
            rvprop="ids",
            ppprop="disambiguation",
        )
        by_revision = {
            revision["revid"]: page
            for page in pages
            if page.get("pageid", 0) > 0 and "missing" not in page
            for revision in page.get("revisions", [])
            if "revid" in revision
        }
        unresolved = [c for c in request.creations if c.revision not in by_revision]
        page_ids = {c.page_id for c in unresolved if c.page_id}
        by_id = {}
        if page_ids:
            _, current = await query(
                pageids="|".join(str(i) for i in sorted(page_ids)),
                prop="info|pageprops",
                ppprop="disambiguation",
            )
            by_id = {
                p["pageid"]: p for p in current if p.get("pageid", 0) > 0 and "missing" not in p
            }
        titles = {c.title for c in unresolved if c.page_id not in by_id}
        by_title, normalized = {}, {}
        if titles:
            value, current = await query(
                titles="|".join(sorted(titles)),
                prop="info|pageprops",
                ppprop="disambiguation",
            )
            # Earliest-revision parameters only support a single page. Fetch
            # roots solely for titles that exist, not for every deleted title.
            for page in current:
                if page.get("pageid", 0) > 0 and "missing" not in page:
                    try:
                        _, history = await query(
                            pageids=page["pageid"],
                            prop="revisions",
                            rvdir="newer",
                            rvlimit=1,
                            rvprop="ids|timestamp",
                        )
                        page["revisions"] = next(iter(history), {}).get("revisions", [])
                    except SourceError:
                        page["revisions"] = []
            by_title = {p.get("title", "").replace("_", " "): p for p in current}
            normalized = {p["from"].replace("_", " "): p["to"] for p in value.get("normalized", [])}

        checked_at = datetime.now(UTC).isoformat()
        output = []
        for creation in request.creations:
            page = by_revision.get(creation.revision) or by_id.get(creation.page_id)
            status, recreated = "online" if page else "unavailable", False
            title = normalized.get(creation.title.replace("_", " "), creation.title).replace(
                "_", " "
            )
            current = by_title.get(title)
            if not page and current:
                if "missing" in current or current.get("pageid", 0) <= 0:
                    # A known historical page ID, or retrieved archive metadata,
                    # establishes deletion. A missing title alone does not.
                    if creation.page_id or creation.deleted_page:
                        status = "deleted"
                else:
                    first = next(iter(current.get("revisions", [])), {})
                    if first.get("revid") == creation.revision:
                        page, status = current, "online"
                    elif first.get("parentid") == 0 and first.get("timestamp"):
                        stamp = datetime.fromisoformat(first["timestamp"].replace("Z", "+00:00"))
                        if stamp > creation.timestamp and (
                            creation.page_id or creation.deleted_page
                        ):
                            # This is a new history root under the same title,
                            # not evidence that the original article was restored.
                            status, recreated = "deleted", True
            output.append(
                {
                    "project": wiki["id"],
                    "revision": creation.revision,
                    "title": creation.title,
                    "status": status,
                    "recreated": recreated,
                    "current_title": (page or current or {}).get("title", creation.title),
                    "page_id": (page or current or {}).get("pageid")
                    if (page or current or {}).get("pageid", 0) > 0
                    else None,
                    "redirect": bool(page and "redirect" in page),
                    "disambiguation": bool(page and "disambiguation" in page.get("pageprops", {})),
                    "checked_at": checked_at,
                }
            )
        return {"pages": output}

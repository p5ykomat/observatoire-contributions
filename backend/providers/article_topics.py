from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from backend.providers.catalog import CatalogProvider
from backend.providers.transport import SourceError, Transport

MODEL = "outlink-topic-model"
THRESHOLD = 0.5


class ArticleRequest(BaseModel):
    project: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=500)
    page_id: int | None = Field(default=None, gt=0)
    creation_revision: int | None = Field(default=None, gt=0)

    @field_validator("title")
    @classmethod
    def title_valid(cls, value: str) -> str:
        if any(ord(c) < 32 or c == "|" for c in value):
            raise ValueError("Titre invalide")
        return value


class TopicScore(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    score: float = Field(ge=0, le=1, allow_inf_nan=False)


class ArticleTopicsProvider:
    def __init__(self, transport: Transport, catalog: CatalogProvider):
        self.transport = transport
        self.catalog = catalog

    async def article(self, request: ArticleRequest) -> dict:
        wiki = await self.catalog.resolve(request.project)
        if wiki["family"] != "wikipedia":
            raise ValueError("Un projet Wikipédia est requis")
        # Resolve the current article by stable page ID when available. Do not
        # follow redirects: the model is not intended for redirect/disambiguation pages.
        data = await self.transport.get(
            f"https://{wiki['domain']}/w/api.php",
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "info|pageprops|revisions",
                "ppprop": "disambiguation",
                "rvlimit": 1,
                "rvdir": "newer",
                "rvprop": "ids",
                **({"pageids": request.page_id} if request.page_id else {"titles": request.title}),
            },
            "mediawiki",
        )
        query = data.get("query")
        pages = query.get("pages") if isinstance(query, dict) else None
        if not isinstance(pages, list) or len(pages) != 1 or not isinstance(pages[0], dict):
            raise SourceError("mediawiki", 502)
        page = pages[0]
        revisions = page.get("revisions", [])
        # A first visible revision with a nonzero parent may follow hidden
        # revisions. It cannot safely identify the article creation.
        first = (
            revisions[0]
            if isinstance(revisions, list) and revisions and isinstance(revisions[0], dict)
            else {}
        )
        result = {
            "project": wiki["id"],
            "title": page.get("title", request.title),
            "page_id": page.get("pageid") if page.get("pageid", 0) > 0 else None,
            "first_revision": first.get("revid") if first.get("parentid") == 0 else None,
            "model": MODEL,
            "threshold": THRESHOLD,
            "fetched_at": datetime.now(UTC).isoformat(),
            "topics": [],
            "status": "excluded",
        }
        if (
            page.get("ns") != 0
            or "missing" in page
            or "invalid" in page
            or "redirect" in page
            or "disambiguation" in page.get("pageprops", {})
        ):
            return result
        if not isinstance(result["page_id"], int) or result["page_id"] <= 0:
            raise SourceError("mediawiki", 502)
        if request.creation_revision and request.creation_revision != result["first_revision"]:
            result.update(status="unclassified", model_skipped=True)
            return result
        prediction = await self.transport.post(
            f"https://api.wikimedia.org/service/lw/inference/v1/models/{MODEL}:predict",
            {
                "lang": wiki["domain"].split(".")[0],
                "page_id": result["page_id"],
                "threshold": THRESHOLD,
            },
            "liftwing",
        )
        payload = prediction.get("prediction")
        rows = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(rows, list) or len(rows) > 64:
            raise SourceError("liftwing", 502)
        try:
            topics = [TopicScore.model_validate(row) for row in rows]
        except ValueError:
            raise SourceError("liftwing", 502) from None
        result["topics"] = [topic.model_dump() for topic in topics if topic.score >= THRESHOLD]
        result["status"] = "classified" if result["topics"] else "unclassified"
        return result

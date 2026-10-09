"""Public archive metadata only, never deleted article text."""

from datetime import datetime
from urllib.parse import quote

from backend.models import Contribution, PageRequest
from backend.providers.catalog import CatalogProvider
from backend.providers.transport import SourceError, Transport


class DeletedContributionsProvider:
    def __init__(self, transport: Transport, catalog: CatalogProvider):
        self.transport = transport
        self.catalog = catalog

    async def wiki(self, request: PageRequest) -> dict:
        if len(request.usernames) != 1:
            raise ValueError("Un compte requis")
        wiki = await self.catalog.resolve(request.project)
        if wiki["family"] != "wikipedia":
            raise ValueError("Un projet Wikipédia est requis")
        return wiki

    async def page(self, request: PageRequest) -> dict:
        wiki = await self.wiki(request)
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "list": "alldeletedrevisions",
            "adruser": request.usernames[0],
            "adrnamespace": 0,
            "adrstart": f"{request.start}T00:00:00Z",
            "adrend": f"{request.end}T23:59:59Z",
            "adrdir": "newer",
            "adrlimit": 500,
            "adrprop": "ids|timestamp|user|flags|tags",
        }
        if request.cursor:
            params["adrcontinue"] = request.cursor
        if not request.interactive:
            params["maxlag"] = 5
        data = await self.transport.get(f"https://{wiki['domain']}/w/api.php", params, "mediawiki")
        pages = data.get("query", {}).get("alldeletedrevisions")
        if not isinstance(pages, list):
            raise SourceError("mediawiki", 502)
        edits, unavailable = [], 0
        for page in pages:
            if page.get("ns") != 0 or not isinstance(page.get("revisions"), list):
                raise SourceError("mediawiki", 502)
            for row in page["revisions"]:
                if "userhidden" in row or "timestamp" not in row or "revid" not in row:
                    unavailable += 1
                    continue
                if row.get("user") != request.usernames[0]:
                    raise SourceError("mediawiki", 502)
                tags = row.get("tags", [])
                edits.append(
                    Contribution(
                        username=row["user"],
                        project=wiki["id"],
                        revision=row["revid"],
                        timestamp=row["timestamp"],
                        namespace=0,
                        title=page.get("title", ""),
                        # Archived IDs must not resolve a newly recreated page with the same title.
                        page_id=None,
                        new_page=None,
                        deleted_page=True,
                        tags=tags,
                        automation="detected"
                        if set(tags) & {"AWB", "AutoWikiBrowser", "massmessage-delivery"}
                        else "unknown",
                        provider="mediawiki-archive",
                    ).model_dump()
                )
        return {
            "contributions": edits,
            "cursor": data.get("continue", {}).get("adrcontinue"),
            "unavailable": unavailable,
        }

    async def creations(self, request: PageRequest) -> dict:
        wiki = await self.wiki(request)
        # Public metadata from archive rows with parent ID zero. The normal
        # Action API does not expose that parent ID for archived revisions.
        url = (
            "https://xtools.wmcloud.org/api/user/pages/"
            f"{quote(wiki['id'], safe='')}/{quote(request.usernames[0], safe='')}/0/all/deleted/"
            f"{request.start}/{request.end}"
        )
        if request.cursor:
            try:
                cursor = datetime.strptime(request.cursor, "%Y-%m-%dT%H:%M:%SZ")
            except ValueError as error:
                raise ValueError("Curseur invalide") from error
            if cursor.strftime("%Y-%m-%dT%H:%M:%SZ") != request.cursor:
                raise ValueError("Curseur invalide")
            url += "/" + quote(request.cursor, safe=":")
        data = await self.transport.get(url, None, "xtools")
        pages = data.get("pages")
        # Current XTools groups nonempty results by namespace; an empty result is [].
        if isinstance(pages, dict):
            pages = pages.get("0", [])
        elif isinstance(pages, list) and pages and isinstance(pages[0], list):
            pages = pages[0]
        if not isinstance(pages, list):
            raise SourceError("xtools", 502)
        ids = []
        for page in pages:
            if (
                not isinstance(page, dict)
                or type(page.get("rev_id")) is not int
                or page["rev_id"] <= 0
            ):
                raise SourceError("xtools", 502)
            if page.get("namespace") != 0:
                raise SourceError("xtools", 502)
            ids.append(page["rev_id"])
        cursor = data.get("continue")
        if cursor:
            try:
                valid = datetime.strptime(cursor, "%Y-%m-%dT%H:%M:%SZ")
                if valid.strftime("%Y-%m-%dT%H:%M:%SZ") != cursor:
                    raise ValueError()
            except (ValueError, TypeError) as error:
                raise SourceError("xtools", 502) from error
        return {"revisions": ids, "cursor": cursor or None}

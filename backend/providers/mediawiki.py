from backend.models import Contribution, PageRequest
from backend.providers.catalog import CatalogProvider
from backend.providers.transport import SourceError, Transport


class MediaWikiContributionsProvider:
    def __init__(self, transport: Transport, catalog: CatalogProvider):
        self.transport = transport
        self.catalog = catalog

    async def namespaces(self, project: str) -> dict:
        wiki = await self.catalog.resolve(project)
        data = await self.transport.get(
            f"https://{wiki['domain']}/w/api.php",
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "meta": "siteinfo",
                "siprop": "namespaces",
            },
            "mediawiki",
        )
        return {"project": wiki, "namespaces": data["query"]["namespaces"]}

    async def page(self, request: PageRequest) -> dict:
        wiki = await self.catalog.resolve(request.project)
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "list": "usercontribs",
            "ucuser": "|".join(request.usernames),
            "ucstart": f"{request.start}T00:00:00Z",
            "ucend": f"{request.end}T23:59:59Z",
            "ucdir": "newer",
            "uclimit": 500,
            "ucprop": "ids|title|timestamp|flags|tags",
        }
        # User-triggered interactive reads may omit maxlag. On Wikidata it
        # also reflects WDQS lag, even though usercontribs does not use WDQS.
        # Background callers keep the recommended conservative default.
        # https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
        if not request.interactive:
            params["maxlag"] = 5
        if request.cursor:
            params["uccontinue"] = request.cursor
        data = await self.transport.get(f"https://{wiki['domain']}/w/api.php", params, "mediawiki")
        rows = data.get("query", {}).get("usercontribs")
        if not isinstance(rows, list):
            raise SourceError("mediawiki", 502)
        contributions = []
        for row in rows:
            tags = row.get("tags", [])
            automation = (
                "bot"
                if "bot" in row
                else "detected"
                if set(tags) & {"AWB", "AutoWikiBrowser", "massmessage-delivery"}
                else "normal"
            )
            contributions.append(
                Contribution(
                    username=row["user"],
                    project=wiki["id"],
                    revision=row["revid"],
                    timestamp=row["timestamp"],
                    namespace=row["ns"],
                    title=row.get("title", ""),
                    page_id=row.get("pageid"),
                    new_page=row.get("new") is True or row.get("new") == "",
                    tags=tags,
                    automation=automation,
                    provider="mediawiki",
                ).model_dump()
            )
        return {
            "contributions": contributions,
            "cursor": data.get("continue", {}).get("uccontinue"),
            "project": wiki,
        }

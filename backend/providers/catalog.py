import re
from urllib.parse import urlparse

from backend.providers.transport import Transport

FAMILIES = {
    "wikipedia",
    "wiktionary",
    "wikisource",
    "wikibooks",
    "wikiquote",
    "wikinews",
    "wikiversity",
    "wikivoyage",
}
SPECIAL = {
    "commonswiki": "commons.wikimedia.org",
    "wikidatawiki": "www.wikidata.org",
    "metawiki": "meta.wikimedia.org",
    "specieswiki": "species.wikimedia.org",
    "mediawikiwiki": "www.mediawiki.org",
    "wikifunctionswiki": "www.wikifunctions.org",
    "incubatorwiki": "incubator.wikimedia.org",
}


def safe_domain(domain: str) -> bool:
    return (
        domain in SPECIAL.values()
        or bool(re.fullmatch(r"[a-z0-9-]+\.wikimedia\.org", domain))
        or bool(
            re.fullmatch(
                r"[a-z0-9-]+\.(?:wikipedia|wiktionary|wikisource|wikibooks|wikiquote|wikinews|wikiversity|wikivoyage)\.org",
                domain,
            )
        )
    )


def family(domain: str) -> str:
    if domain == "commons.wikimedia.org":
        return "commons"
    return domain.split(".")[-2]


class CatalogProvider:
    def __init__(self, transport: Transport):
        self.transport = transport

    async def catalog(self) -> list[dict]:
        data = await self.transport.get(
            "https://meta.wikimedia.org/w/api.php",
            {
                "action": "sitematrix",
                "format": "json",
                "formatversion": 2,
            },
            "mediawiki",
        )
        rows = []
        for group in data["sitematrix"].values():
            sites = (
                group.get("site", [])
                if isinstance(group, dict)
                else group
                if isinstance(group, list)
                else []
            )
            for site in sites:
                domain = urlparse(site["url"]).hostname or ""
                if safe_domain(domain):
                    rows.append(
                        {
                            "id": site["dbname"],
                            "domain": domain,
                            "family": family(domain),
                            "label": domain,
                            "closed": "closed" in site,
                        }
                    )
        return rows

    async def resolve(self, project: str) -> dict:
        # Public, non-personal metadata may be cached in an instance.
        for row in await self.catalog():
            if project in {row["id"], row["domain"]}:
                return row
        raise ValueError("Projet Wikimédia inconnu")

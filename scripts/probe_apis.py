"""Contrôle public facultatif. Aucun nom de cohorte dans les sorties."""

import asyncio

from backend.models import GlobalRequest
from backend.providers.catalog import CatalogProvider
from backend.providers.centralauth import CentralAuthProvider
from backend.providers.mediawiki import MediaWikiContributionsProvider
from backend.providers.transport import SourceError, Transport, make_client
from backend.providers.xtools import XToolsGlobalContributionsProvider


async def main():
    async with make_client() as client:
        transport = Transport(client)
        for name, operation in [
            ("CentralAuth", CentralAuthProvider(transport).qualify(["Example"])),
            (
                "MediaWiki",
                MediaWikiContributionsProvider(transport, CatalogProvider(transport)).namespaces(
                    "frwiki"
                ),
            ),
            (
                "XTools",
                XToolsGlobalContributionsProvider(transport).page(
                    GlobalRequest(username="Example", start="2024-01-01", end="2024-01-02")
                ),
            ),
        ]:
            try:
                result = await operation
                print(name, "ok", type(result).__name__)
            except SourceError as error:
                print(name, "unavailable", error.status)


if __name__ == "__main__":
    asyncio.run(main())

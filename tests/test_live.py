import os

import pytest

from backend.models import GlobalRequest, PageRequest
from backend.providers.catalog import CatalogProvider
from backend.providers.centralauth import CentralAuthProvider
from backend.providers.dashboard import DashboardProvider
from backend.providers.mediawiki import MediaWikiContributionsProvider
from backend.providers.transport import Transport, make_client
from backend.providers.xtools import XToolsGlobalContributionsProvider

pytestmark = pytest.mark.integration


async def test_public_apis_live():
    async with make_client() as client:
        transport = Transport(client)
        catalog = CatalogProvider(transport)
        assert await CentralAuthProvider(transport).qualify(["Example"])
        assert await catalog.resolve("frwiki")
        provider = MediaWikiContributionsProvider(transport, catalog)
        assert await provider.namespaces("frwiki")
        assert "contributions" in await provider.page(
            PageRequest(
                usernames=["Example"], project="frwiki", start="2024-01-01", end="2024-01-02"
            )
        )
        assert "rows" in await XToolsGlobalContributionsProvider(transport).page(
            GlobalRequest(username="Example", start="2024-01-01", end="2024-01-02")
        )


async def test_dashboard_live():
    url = os.getenv("RETENTION_TEST_DASHBOARD_URL")
    if not url:
        pytest.skip("Définissez RETENTION_TEST_DASHBOARD_URL pour un programme public")
    async with make_client() as client:
        assert "participants" in await DashboardProvider(Transport(client)).course(url)

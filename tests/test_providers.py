from datetime import date
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.analysis.taxonomy import classify
from backend.main import app
from backend.models import BatchRequest, GlobalRequest, PageRequest
from backend.providers.catalog import CatalogProvider, safe_domain
from backend.providers.centralauth import CentralAuthProvider
from backend.providers.dashboard import DashboardProvider, parse_dashboard, participants
from backend.providers.mediawiki import MediaWikiContributionsProvider
from backend.providers.transport import SourceError, Transport, retry_delay
from backend.providers.xtools import XToolsGlobalContributionsProvider


@pytest.fixture
def transport():
    return AsyncMock(spec=Transport)


async def test_global_batch_missing_bot_and_centralid(transport):
    transport.get.return_value = {
        "query": {
            "globalusers": [
                {
                    "name": "Humanbot",
                    "centralid": 12,
                    "registration": "2024-01-01T00:00:00Z",
                    "groups": [],
                    "locked": False,
                    "editcount": 3,
                },
                {"name": "Machine", "centralid": 13, "groups": ["global-bot"], "locked": True},
                {"name": "Absent", "missing": True},
                {"name": "1.2.3.4", "invalid": True},
            ]
        }
    }
    result = await CentralAuthProvider(transport).qualify(
        ["Humanbot", "Machine", "Absent", "1.2.3.4"]
    )
    assert result[0]["global_id"] == 12
    assert not result[0]["bot"]
    assert result[1]["bot"] and result[1]["locked"]
    assert not result[2]["exists"] and result[3]["invalid"]
    assert transport.get.await_count == 1
    assert transport.get.call_args.args[1]["gususers"] == "Humanbot|Machine|Absent|1.2.3.4"


async def test_local_accounts_refuse_incomplete_format(transport):
    transport.get.return_value = {"query": {"globaluserinfo": {"missing": True}}}
    with pytest.raises(SourceError):
        await CentralAuthProvider(transport).local_accounts("Absent")


@pytest.mark.parametrize(
    "url",
    [
        "http://outreachdashboard.wmflabs.org/courses/A/B",
        "https://evil.org/courses/A/B",
        "https://outreachdashboard.wmflabs.org.evil.org/courses/A/B",
        "https://user@outreachdashboard.wmflabs.org/courses/A/B",
        "https://outreachdashboard.wmflabs.org:444/courses/A/B",
        "https://outreachdashboard.wmflabs.org/courses/../B",
        "https://outreachdashboard.wmflabs.org/courses/A/%2e%2e",
        "https://outreachdashboard.wmflabs.org/courses/A/B/extra",
    ],
)
def test_dashboard_ssrf(url):
    with pytest.raises(ValueError):
        parse_dashboard(url)


def test_dashboard_roles():
    rows = participants(
        [
            {"username": "Alice", "role": 0},
            {"username": "Alice", "role": 1},
            {"username": "Bob", "role": 0},
            {"username": "Carol", "program_manager": True},
            {"username": "Dave"},
        ]
    )
    assert rows[0]["staff"] and rows[0]["role_conflict"] and not rows[0]["included"]
    assert rows[1]["included"] and not rows[1]["staff"]
    assert not rows[2]["included"] and rows[3]["roles"] == ["unknown"]


async def test_dashboard_import(transport):
    transport.get.side_effect = [
        {
            "course": {
                "title": "Atelier",
                "start": "2024-01-01",
                "end": "2024-01-02",
                "home_wiki": {"language": "fr", "project": "wikipedia"},
            }
        },
        {"course": {"users": [{"username": "Alice", "role": 0}]}},
    ]
    result = await DashboardProvider(transport).course(
        "https://outreachdashboard.wmflabs.org/courses/Org/Atelier"
    )
    assert result["title"] == "Atelier" and result["participants"][0]["included"]
    assert transport.get.call_args_list[0].args[0] == (
        "https://outreachdashboard.wmflabs.org/courses/Org/Atelier/course.json"
    )
    assert transport.get.call_args_list[1].args[0].endswith("/users.json")


@pytest.mark.parametrize("status", [404, 429, 500, 502, 503, 504])
async def test_source_failure_status_and_retry_after(status):
    def handler(request):
        return httpx.Response(status, headers={"Retry-After": "120"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(SourceError) as error:
            await Transport(client).get("https://meta.wikimedia.org/w/api.php", None, "centralauth")
        assert error.value.status == status and error.value.retry_after == 120


@pytest.mark.parametrize("error", [httpx.ReadTimeout("timeout"), httpx.ConnectError("network")])
async def test_timeout_and_network(error):
    def handler(request):
        raise error

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(SourceError) as caught:
            await Transport(client).get("https://meta.wikimedia.org/w/api.php", None, "mediawiki")
        assert caught.value.status == 504


@pytest.mark.parametrize("body", ["not json", "[]", '{"error":{"code":"maxlag"}}'])
async def test_invalid_json_or_api_error(body):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, text=body))
    ) as client:
        with pytest.raises(SourceError):
            await Transport(client).get("https://meta.wikimedia.org/w/api.php", None, "mediawiki")


def test_retry_after_dates_and_backoff():
    assert retry_delay("Wed, 01 Jan 2020 00:00:00 GMT") == 0
    assert 4 <= retry_delay(None, 2) <= 4.5


async def test_mediawiki_batch_pagination_and_flags(transport):
    catalog = AsyncMock(spec=CatalogProvider)
    catalog.resolve.return_value = {
        "id": "frwiki",
        "domain": "fr.wikipedia.org",
        "family": "wikipedia",
    }
    transport.get.return_value = {
        "query": {
            "usercontribs": [
                {
                    "user": "Alice",
                    "revid": 4,
                    "timestamp": "2024-01-02T12:00:00Z",
                    "ns": 0,
                    "title": "Page",
                    "tags": ["AWB"],
                }
            ]
        },
        "continue": {"uccontinue": "next"},
    }
    provider = MediaWikiContributionsProvider(transport, catalog)
    result = await provider.page(
        PageRequest(
            usernames=["Alice", "Bob"],
            project="frwiki",
            start="2024-01-01",
            end="2024-01-03",
            cursor="first",
        )
    )
    assert result["cursor"] == "next" and result["contributions"][0]["automation"] == "detected"
    assert transport.get.call_args.args[1]["ucuser"] == "Alice|Bob"
    assert transport.get.call_args.args[1]["uccontinue"] == "first"
    assert transport.get.call_args.args[1]["ucend"].endswith("23:59:59Z")


async def test_namespace_metadata_is_independent_of_query_service_lag():
    def handler(request):
        if "maxlag" in request.url.params:
            return httpx.Response(200, json={"error": {"code": "maxlag"}})
        return httpx.Response(
            200, json={"query": {"namespaces": {"0": {"id": 0, "canonical": ""}}}}
        )

    catalog = AsyncMock(spec=CatalogProvider)
    catalog.resolve.return_value = {
        "id": "wikidatawiki",
        "domain": "www.wikidata.org",
        "family": "wikidata",
    }
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = MediaWikiContributionsProvider(Transport(client), catalog)
        assert (await provider.namespaces("wikidatawiki"))["namespaces"]["0"]["id"] == 0
        # Contribution queries still respect database/server lag.
        with pytest.raises(SourceError) as error:
            await provider.page(
                PageRequest(
                    usernames=["Alice"],
                    project="wikidatawiki",
                    start="2026-05-01",
                    end="2026-07-01",
                )
            )
        assert error.value.status == 503


async def test_xtools_timestamp_pagination(transport):
    transport.get.return_value = {
        "globalcontribs": [{"rev_id": 4}],
        "continue": "2024-01-02T12:00:00Z",
    }
    result = await XToolsGlobalContributionsProvider(transport).page(
        GlobalRequest(
            username="Alice / B",
            start="2024-01-01",
            end="2024-01-03",
            cursor="2024-01-02T12:00:00Z",
        )
    )
    url = transport.get.call_args.args[0]
    assert "/api/user/globalcontribs/" in url and "Alice%20%2F%20B" in url
    assert result["cursor"] == "2024-01-02T12:00:00Z"


@pytest.mark.parametrize(
    "project,family,namespace,expected",
    [
        ("frwiki", "wikipedia", {"canonical": ""}, "CONTENT"),
        ("frwiki", "wikipedia", {"canonical": "User talk"}, "COMMUNITY"),
        ("commonswiki", "commons", {"canonical": "File"}, "MEDIA"),
        ("commonswiki", "commons", {"canonical": "Category"}, "MAINTENANCE"),
        ("wikidatawiki", "wikidata", {"canonical": "Lexeme"}, "STRUCTURED_DATA"),
        ("wikidatawiki", "wikidata", {"canonical": "Property"}, "STRUCTURED_DATA"),
        ("frwikisource", "wikisource", {"canonical": "Page"}, "CONTENT"),
        ("frwikisource", "wikisource", {"canonical": "Index"}, "MAINTENANCE"),
        ("unknown", "unknown", {"canonical": ""}, "OTHER"),
    ],
)
def test_taxonomy(project, family, namespace, expected):
    assert classify(project, family, namespace) == expected


@pytest.mark.parametrize(
    "domain",
    [
        "localhost",
        "127.0.0.1",
        "fr.wikipedia.org.evil.com",
        "wikimedia.org.evil.com",
        "www.wikipedia.org:443",
    ],
)
def test_project_domain_allowlist(domain):
    assert not safe_domain(domain)


def test_validation_and_no_echo_of_cohort():
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        response = client.post("/api/qualify", json={"usernames": ["Secret|Name"]})
        assert response.status_code == 422 and "Secret" not in response.text
        assert response.headers["cache-control"] == "no-store"
        response = client.post("/api/dashboard", json={"url": "http://127.0.0.1"})
        assert response.status_code == 422
        assert client.post("/api/qualify", content="x" * 1_000_001).status_code == 413


def test_models_normalization_batch_size_dates():
    assert BatchRequest(usernames=["alice_bob"]).usernames == ["Alice bob"]
    with pytest.raises(ValueError):
        BatchRequest(usernames=["A"] * 51)
    with pytest.raises(ValueError):
        PageRequest(usernames=["A"], project="frwiki", start=date(2024, 2, 2), end=date(2024, 1, 1))

from unittest.mock import AsyncMock

import httpx
import pytest

from backend.providers.event_registration import (
    EventAccountsRequest,
    EventRegistrationProvider,
    EventRequest,
    event_time,
    parse_event_url,
)
from backend.providers.transport import SourceError, Transport


def provider(**changes):
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {
        "id": 42,
        "name": "Formation",
        "event_page": "Event:Formation",
        "start_time": "20260401003000",
        "end_time": "20260401183000",
        "timezone": "Europe/Paris",
        "wikis": ["frwiki", "commonswiki"],
        **changes,
    }
    transport.get_html.return_value = (
        '<script>RLCONF={"wgCampaignEventsEventID":42,"other":true};</script>'
    )
    catalog = AsyncMock()
    catalog.resolve.return_value = {"id": "metawiki", "domain": "meta.wikimedia.org"}
    catalog.catalog.return_value = [{"id": "metawiki"}, {"id": "frwiki"}, {"id": "commonswiki"}]
    return EventRegistrationProvider(transport, catalog), transport


@pytest.mark.parametrize(
    "url",
    [
        "http://meta.wikimedia.org/wiki/Event:Formation",
        "https://meta.wikimedia.org.evil.example/wiki/Event:Formation",
        "https://user@meta.wikimedia.org/wiki/Event:Formation",
        "https://meta.wikimedia.org:444/wiki/Event:Formation",
        "https://127.0.0.1/wiki/Event:Formation",
        "https://meta.wikimedia.org/api/Event:Formation",
        "https://meta.wikimedia.org/wiki/Event:../..",
        "https://meta.wikimedia.org/wiki/Event:Formation/%2e%2e/private",
        "https://meta.wikimedia.org/w/index.php?title=A&title=B",
    ],
)
def test_only_canonical_public_wiki_urls_are_accepted(url):
    with pytest.raises(ValueError):
        parse_event_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://meta.wikimedia.org/wiki/Special:EventDetails/42?tab=participants",
        "https://meta.wikimedia.org/w/index.php?title=Special%3AEventDetails%2F42",
    ],
)
async def test_details_url_uses_official_api_and_preserves_local_times_and_utc_dates(url):
    p, transport = provider()
    result = await p.event(EventRequest(url=url))
    assert result["start"] == "2026-03-31" and result["end"] == "2026-04-01"
    assert result["starts_at"] == "2026-03-31T22:30:00Z"
    assert result["start_local"] == "2026-04-01 00:30"
    assert result["timezone"] == "Europe/Paris"
    assert result["projects"] == ["frwiki", "commonswiki"]
    assert "metawiki" not in result["projects"]
    assert result["public_only"] is True and result["dates_confirmed"] is False
    transport.get_html.assert_not_awaited()
    assert transport.get.call_args.args[0].endswith("/campaignevents/v0/event_registration/42")


async def test_event_page_resolves_public_config_without_executing_scripts_or_following_links():
    p, transport = provider(wikis=["*"])
    result = await p.event(EventRequest(url="https://meta.wikimedia.org/wiki/Event:Formation"))
    assert result["id"] == 42 and result["all_projects"] is True
    assert result["projects"] == []
    assert transport.get_html.call_args.args[0] == "https://meta.wikimedia.org/wiki/Event:Formation"
    transport.get_html.return_value = '<a href="https://evil.example">EventDetails/42</a>'
    with pytest.raises(ValueError):
        await p.event(EventRequest(url="https://meta.wikimedia.org/wiki/Event:Formation"))


@pytest.mark.parametrize(
    "changes",
    [
        {"id": 43},
        {"start_time": "invalid"},
        {"timezone": "Unknown/Timezone"},
        {"end_time": "20260101000000"},
        {"wikis": None},
    ],
)
async def test_invalid_metadata_is_not_imported(changes):
    p, _ = provider(**changes)
    with pytest.raises(SourceError):
        await p.event(EventRequest(url="https://meta.wikimedia.org/wiki/Special:EventDetails/42"))


def test_winter_and_summer_timezone_offsets_are_converted():
    assert event_time("20260101100000", "Europe/Paris").hour == 9
    assert event_time("20260701100000", "Europe/Paris").hour == 8
    assert event_time("20260101100000", "+00:00").hour == 10
    assert event_time("20260101100000", "-03:00").hour == 13
    assert event_time("20260101100000", "+14:00").date().isoformat() == "2025-12-31"


async def test_short_pages_continue_hidden_accounts_are_counted_and_only_safe_fields_returned():
    p, transport = provider()
    transport.get_list.return_value = [
        {
            "participant_id": 21,
            "user_id": 1,
            "user_name": "PublicAccount",
            "private": False,
            "user_registered_at": "20260101080000",
            "non_pii_answers": "unused",
        },
        {"participant_id": 22, "user_id": 2, "hidden": True, "private": False},
    ]
    result = await p.accounts(
        EventAccountsRequest(project="metawiki", event_id=42, kind="participants", cursor=20)
    )
    assert result["cursor"] == 22 and result["unavailable"] == 1
    assert result["accounts"] == [
        {
            "username": "PublicAccount",
            "global_id": 1,
            "staff": False,
            "included": True,
            "roles": ["participant"],
        }
    ]
    params = transport.get_list.call_args.args[1]
    assert params == {"include_private": "false", "last_participant_id": 20}
    transport.get_list.return_value = []
    assert (
        await p.accounts(
            EventAccountsRequest(project="metawiki", event_id=42, kind="participants", cursor=22)
        )
    )["cursor"] is None


async def test_organizers_are_separate_and_excluded_by_default():
    p, transport = provider()
    transport.get_list.return_value = [{"organizer_id": 12, "user_id": 1, "user_name": "Organizer"}]
    result = await p.accounts(
        EventAccountsRequest(project="metawiki", event_id=42, kind="organizers", cursor=11)
    )
    assert result["accounts"][0]["staff"] is True
    assert result["accounts"][0]["included"] is False
    assert result["cursor"] == 12
    assert transport.get_list.call_args.args[1] == {"last_organizer_id": 11}


@pytest.mark.parametrize(
    "row",
    [
        {"participant_id": 1, "user_id": 1, "user_name": "PrivateAccount", "private": True},
        {"participant_id": 0, "user_id": 1, "user_name": "InvalidCursor"},
        {"participant_id": 1, "user_id": 0, "user_name": "InvalidID"},
    ],
)
async def test_private_or_invalid_account_rows_are_never_passed_to_browser(row):
    p, transport = provider()
    transport.get_list.return_value = [row]
    with pytest.raises(SourceError):
        await p.accounts(EventAccountsRequest(project="metawiki", event_id=42, kind="participants"))


async def test_json_array_transport_and_html_do_not_change_other_provider_contracts():
    def handler(request):
        assert "authorization" not in request.headers
        if request.url.path == "/page":
            assert request.headers["accept"] == "text/html"
            return httpx.Response(200, text='<script>"wgCampaignEventsEventID":42</script>')
        return httpx.Response(200, json=[{"participant_id": 1}])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        transport = Transport(client)
        assert await transport.get_list(
            "https://meta.wikimedia.org/list", None, "event-registration"
        ) == [{"participant_id": 1}]
        assert '"wgCampaignEventsEventID":42' in await transport.get_html(
            "https://meta.wikimedia.org/page", "event-registration"
        )
        with pytest.raises(SourceError):
            await transport.get("https://meta.wikimedia.org/list", None, "mediawiki")

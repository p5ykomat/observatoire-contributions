from unittest.mock import AsyncMock

import pytest

from backend.models import PageRequest
from backend.providers.deleted_contributions import DeletedContributionsProvider
from backend.providers.transport import SourceError, Transport


def provider(data):
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = data
    catalog = AsyncMock()
    catalog.resolve.return_value = {
        "id": "frwiki",
        "domain": "fr.wikipedia.org",
        "family": "wikipedia",
    }
    return DeletedContributionsProvider(transport, catalog), transport


def request(**extra):
    return PageRequest(
        usernames=["TestAccount"], project="frwiki", start="2026-01-01", end="2026-01-31", **extra
    )


async def test_public_archive_metadata_and_continuation_without_deleted_text():
    p, transport = provider(
        {
            "query": {
                "alldeletedrevisions": [
                    {
                        "ns": 0,
                        "title": "Deleted article",
                        "revisions": [
                            {
                                "revid": 42,
                                "user": "TestAccount",
                                "timestamp": "2026-01-02T12:00:00Z",
                                "tags": ["AWB"],
                            },
                            {"revid": 43, "userhidden": True, "timestamp": "2026-01-03T12:00:00Z"},
                        ],
                    }
                ]
            },
            "continue": {"adrcontinue": "20260103120000|1"},
        }
    )
    result = await p.page(request(cursor="20260101120000|1"))
    assert result["unavailable"] == 1 and result["cursor"] == "20260103120000|1"
    assert len(result["contributions"]) == 1
    edit = result["contributions"][0]
    assert edit["deleted_page"] is True and edit["new_page"] is None
    assert edit["revision"] == 42 and edit["page_id"] is None
    assert edit["automation"] == "detected"
    url, params, _ = transport.get.call_args.args
    assert url == "https://fr.wikipedia.org/w/api.php"
    assert params["adrnamespace"] == 0 and params["adruser"] == "TestAccount"
    assert params["adrstart"] == "2026-01-01T00:00:00Z"
    assert params["adrend"] == "2026-01-31T23:59:59Z"
    assert "content" not in params["adrprop"] and "slots" not in params
    assert params["adrcontinue"] == "20260101120000|1"


async def test_empty_archive_page_still_continues():
    p, _ = provider({"query": {"alldeletedrevisions": []}, "continue": {"adrcontinue": "next"}})
    assert await p.page(request()) == {"contributions": [], "cursor": "next", "unavailable": 0}


@pytest.mark.parametrize(
    "pages",
    [
        None,
        [{"ns": 1, "revisions": []}],
        [
            {
                "ns": 0,
                "revisions": [
                    {"revid": 42, "user": "OtherAccount", "timestamp": "2026-01-01T00:00:00Z"}
                ],
            }
        ],
    ],
)
async def test_missing_or_wrong_scope_archive_is_not_zero_activity(pages):
    p, _ = provider({"query": {"alldeletedrevisions": pages}})
    with pytest.raises(SourceError):
        await p.page(request())


@pytest.mark.parametrize(
    "pages",
    [
        [[{"namespace": 0, "rev_id": 42, "deleted": True}]],
        {"0": [{"namespace": 0, "rev_id": 42, "deleted": True}]},
        [{"namespace": 0, "rev_id": 42, "deleted": True}],
    ],
)
async def test_creation_ids_from_public_xtools_grouped_namespace_results(pages):
    p, transport = provider({"pages": pages, "continue": "2026-01-01T12:00:00Z"})
    result = await p.creations(request(cursor="2026-01-01T13:00:00Z"))
    assert result == {"revisions": [42], "cursor": "2026-01-01T12:00:00Z"}
    assert transport.get.call_args.args[0].endswith(
        "/frwiki/TestAccount/0/all/deleted/2026-01-01/2026-01-31/2026-01-01T13:00:00Z"
    )


async def test_empty_creation_page_and_invalid_cursor():
    p, transport = provider({"pages": []})
    assert await p.creations(request()) == {"revisions": [], "cursor": None}
    transport.reset_mock()
    with pytest.raises(ValueError):
        await p.creations(request(cursor="../invalid"))
    transport.get.assert_not_awaited()


@pytest.mark.parametrize("cursor", ["../invalid", 20260101120000, "2026-01-32T12:00:00Z"])
async def test_malformed_creation_continuation_is_a_source_error(cursor):
    p, _ = provider({"pages": [], "continue": cursor})
    with pytest.raises(SourceError):
        await p.creations(request())


@pytest.mark.parametrize("pages", [None, [{"namespace": 1, "rev_id": 1}], [{"namespace": 0}]])
async def test_malformed_creations_are_not_classified_as_modifications(pages):
    p, _ = provider({"pages": pages})
    with pytest.raises(SourceError):
        await p.creations(request())


async def test_only_one_account_on_wikipedia_and_errors_preserved():
    p, transport = provider({})
    with pytest.raises(ValueError):
        await p.page(
            PageRequest(
                usernames=["TestAccount", "OtherAccount"],
                project="frwiki",
                start="2026-01-01",
                end="2026-01-31",
            )
        )
    p.catalog.resolve.return_value["family"] = "commons"
    with pytest.raises(ValueError):
        await p.creations(request())
    transport.get.assert_not_awaited()
    p.catalog.resolve.return_value["family"] = "wikipedia"
    transport.get.side_effect = SourceError("mediawiki", 503)
    with pytest.raises(SourceError) as error:
        await p.page(request())
    assert error.value.status == 503

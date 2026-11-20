from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from backend.providers.article_status import ArticleStatusProvider, ArticleStatusRequest
from backend.providers.transport import SourceError, Transport


def provider(responses):
    transport = AsyncMock(spec=Transport)
    transport.get.side_effect = responses
    catalog = AsyncMock()
    catalog.resolve.return_value = {
        "id": "frwiki",
        "domain": "fr.wikipedia.org",
        "family": "wikipedia",
    }
    return ArticleStatusProvider(transport, catalog), transport


def request(**extra):
    return ArticleStatusRequest(
        project="frwiki",
        creations=[
            {
                "revision": 12,
                "title": "Old title",
                "timestamp": "2026-10-07T12:00:00Z",
                **extra,
            }
        ],
    )


async def test_public_creation_follows_renames_by_revision_without_model():
    p, transport = provider(
        [
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 8,
                            "title": "Renamed",
                            "ns": 0,
                            "revisions": [{"revid": 12, "parentid": 0}],
                        }
                    ]
                }
            }
        ]
    )
    row = (await p.pages(request()))["pages"][0]
    assert row["status"] == "online" and row["current_title"] == "Renamed"
    assert not row["recreated"]
    assert transport.get.call_count == 1
    transport.post.assert_not_awaited()


async def test_hidden_creation_revision_can_still_identify_existing_original_page():
    p, _ = provider(
        [
            {"query": {"badrevids": {"12": {"revid": 12}}}},
            {"query": {"pages": [{"pageid": 8, "ns": 0, "title": "Renamed", "redirect": True}]}},
        ]
    )
    row = (await p.pages(request(page_id=8)))["pages"][0]
    assert row["status"] == "online" and row["redirect"]


async def test_archived_creation_with_no_current_page_is_deleted():
    p, _ = provider(
        [
            {"query": {"badrevids": {"12": {"revid": 12}}}},
            {"query": {"pages": [{"ns": 0, "title": "Old title", "missing": True}]}},
        ]
    )
    row = (await p.pages(request(deleted_page=True)))["pages"][0]
    assert row["status"] == "deleted" and not row["recreated"]


async def test_new_history_root_confirms_reused_title_without_restoring_original():
    p, _ = provider(
        [
            {"query": {}},
            {
                "query": {
                    "normalized": [{"from": "Old_title", "to": "Old title"}],
                    "pages": [
                        {
                            "pageid": 99,
                            "ns": 0,
                            "title": "Old title",
                            "revisions": [
                                {"revid": 300, "parentid": 0, "timestamp": "2026-11-01T12:00:00Z"},
                            ],
                        }
                    ],
                }
            },
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 99,
                            "revisions": [
                                {"revid": 300, "parentid": 0, "timestamp": "2026-11-01T12:00:00Z"}
                            ],
                        }
                    ]
                }
            },
        ]
    )
    row = (await p.pages(request(title="Old_title", deleted_page=True)))["pages"][0]
    assert row["status"] == "deleted" and row["recreated"] and row["page_id"] == 99


async def test_restored_original_revision_counts_as_online():
    p, _ = provider(
        [
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 8,
                            "ns": 0,
                            "title": "Old title",
                            "revisions": [{"revid": 12}],
                        }
                    ]
                }
            }
        ]
    )
    row = (await p.pages(request(deleted_page=True)))["pages"][0]
    assert row["status"] == "online" and not row["recreated"]


async def test_hidden_root_does_not_prove_recreation():
    p, _ = provider(
        [
            {"query": {}},
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 99,
                            "ns": 0,
                            "title": "Old title",
                            "revisions": [
                                {
                                    "revid": 300,
                                    "parentid": 299,
                                    "timestamp": "2026-11-01T12:00:00Z",
                                },
                            ],
                        }
                    ]
                }
            },
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 99,
                            "revisions": [
                                {"revid": 300, "parentid": 299, "timestamp": "2026-11-01T12:00:00Z"}
                            ],
                        }
                    ]
                }
            },
        ]
    )
    row = (await p.pages(request(deleted_page=True)))["pages"][0]
    assert row["status"] == "unavailable" and not row["recreated"]


async def test_multiple_archived_titles_use_batched_info_but_single_page_history_queries():
    p, transport = provider(
        [
            {"query": {}},
            {
                "query": {
                    "pages": [
                        {"title": "Old title", "pageid": 99, "ns": 0},
                        {"title": "Other title", "missing": True, "ns": 0},
                    ]
                }
            },
            {
                "query": {
                    "pages": [
                        {
                            "pageid": 99,
                            "revisions": [
                                {"revid": 300, "parentid": 0, "timestamp": "2026-11-01T12:00:00Z"},
                            ],
                        }
                    ]
                }
            },
        ]
    )
    body = request(deleted_page=True)
    body.creations.append(
        body.creations[0].model_copy(update={"revision": 13, "title": "Other title"})
    )
    rows = (await p.pages(body))["pages"]
    assert [row["status"] for row in rows] == ["deleted", "deleted"]
    assert [row["recreated"] for row in rows] == [True, False]
    calls = transport.get.call_args_list
    assert "|" in calls[1].args[1]["titles"] and "rvdir" not in calls[1].args[1]
    assert calls[2].args[1]["pageids"] == 99 and calls[2].args[1]["rvdir"] == "newer"


async def test_missing_title_without_historical_identity_is_not_proof_of_deletion():
    p, _ = provider(
        [{"query": {}}, {"query": {"pages": [{"title": "Old title", "missing": True}]}}]
    )
    assert (await p.pages(request()))["pages"][0]["status"] == "unavailable"


async def test_invalid_source_is_not_an_empty_status_result():
    p, _ = provider([{}])
    with pytest.raises(SourceError):
        await p.pages(request())


async def test_other_projects_are_rejected_without_queries():
    p, transport = provider([])
    p.catalog.resolve.return_value["family"] = "wikidata"
    with pytest.raises(ValueError):
        await p.pages(request())
    transport.get.assert_not_awaited()


def test_status_request_bounds_and_title_validation():
    with pytest.raises(ValidationError):
        request(title="One|Two")
    with pytest.raises(ValidationError):
        request(revision=0)
    with pytest.raises(ValidationError):
        ArticleStatusRequest(project="frwiki", creations=[request().creations[0]] * 51)

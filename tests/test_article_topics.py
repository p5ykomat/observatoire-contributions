from unittest.mock import AsyncMock

import httpx
import pytest

from backend.models import PageRequest
from backend.providers.article_topics import ArticleRequest, ArticleTopicsProvider
from backend.providers.mediawiki import MediaWikiContributionsProvider
from backend.providers.transport import SourceError, Transport


def provider(page, prediction=None):
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {"query": {"pages": [page]}}
    transport.post.return_value = prediction or {
        "prediction": {"results": [{"topic": "STEM.Physics", "score": 0.8}]}
    }
    catalog = AsyncMock()
    catalog.resolve.return_value = {
        "id": "frwiki",
        "domain": "fr.wikipedia.org",
        "family": "wikipedia",
    }
    return ArticleTopicsProvider(transport, catalog), transport


async def test_topics_current_page_id_threshold_and_creation_revision():
    p, transport = provider(
        {
            "pageid": 42,
            "title": "Renamed article",
            "ns": 0,
            "revisions": [{"revid": 5, "parentid": 0}],
        },
        {
            "prediction": {
                "results": [
                    {"topic": "STEM.Physics", "score": 0.5},
                    {"topic": "Culture.Biography.Biography*", "score": 0.49},
                ]
            }
        },
    )
    result = await p.article(ArticleRequest(project="frwiki", title="Old title", page_id=42))
    assert result["first_revision"] == 5 and result["title"] == "Renamed article"
    assert result["topics"] == [{"topic": "STEM.Physics", "score": 0.5}]
    assert result["status"] == "classified" and result["threshold"] == 0.5
    assert transport.get.call_args.args[1]["pageids"] == 42
    assert "redirects" not in transport.get.call_args.args[1]
    assert transport.post.call_args.args[1] == {"lang": "fr", "page_id": 42, "threshold": 0.5}


@pytest.mark.parametrize(
    "extra",
    [{"redirect": True}, {"pageprops": {"disambiguation": ""}}, {"missing": True}, {"ns": 1}],
)
async def test_non_articles_are_not_sent_to_model(extra):
    p, transport = provider({"pageid": 42, "ns": 0, "title": "Page", **extra})
    result = await p.article(ArticleRequest(project="frwiki", title="Page"))
    assert result["status"] == "excluded"
    transport.post.assert_not_awaited()


async def test_hidden_first_revision_and_no_topic_are_not_false_creation_or_failure():
    p, _ = provider(
        {"pageid": 42, "ns": 0, "title": "Page", "revisions": [{"revid": 8, "parentid": 5}]},
        {"prediction": {"results": []}},
    )
    result = await p.article(ArticleRequest(project="frwiki", title="Page"))
    assert result["first_revision"] is None and result["status"] == "unclassified"


@pytest.mark.parametrize("score", [-1, 2, float("nan")])
async def test_invalid_predictions_are_failures_not_empty_topics(score):
    p, _ = provider(
        {"pageid": 42, "ns": 0},
        {"prediction": {"results": [{"topic": "STEM.Physics", "score": score}]}},
    )
    with pytest.raises(SourceError):
        await p.article(ArticleRequest(project="frwiki", title="Page"))


async def test_non_wikipedia_refused():
    p, transport = provider({})
    p.catalog.resolve.return_value["family"] = "commons"
    with pytest.raises(ValueError):
        await p.article(ArticleRequest(project="commonswiki", title="Page"))
    transport.get.assert_not_awaited()


async def test_creation_only_does_not_call_model_for_an_existing_article():
    p, transport = provider(
        {"pageid": 42, "title": "Article", "ns": 0, "revisions": [{"revid": 1, "parentid": 0}]}
    )
    result = await p.article(ArticleRequest(project="frwiki", title="Article", creation_revision=2))
    assert result["first_revision"] == 1 and result["model_skipped"] is True
    transport.post.assert_not_awaited()
    result = await p.article(ArticleRequest(project="frwiki", title="Article", creation_revision=1))
    assert result["status"] == "classified"
    transport.post.assert_awaited_once()


async def test_liftwing_post_honours_retry_after():
    def handler(request):
        assert request.method == "POST"
        assert b'"page_id":42' in request.content
        return httpx.Response(429, headers={"Retry-After": "60"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(SourceError) as error:
            await Transport(client).post(
                "https://api.wikimedia.org/service/lw/inference/v1/models/outlink-topic-model:predict",
                {"page_id": 42},
                "liftwing",
            )
        assert error.value.provider == "liftwing" and error.value.retry_after == 60


@pytest.mark.parametrize(
    "flags,expected",
    [({}, False), ({"new": True}, True), ({"new": ""}, True), ({"new": False}, False)],
)
async def test_mediawiki_creation_flags_survive_collection(flags, expected):
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {
        "query": {
            "usercontribs": [
                {
                    "user": "TestAccount",
                    "pageid": 42,
                    "revid": 1,
                    "timestamp": "2026-01-01T00:00:00Z",
                    "ns": 0,
                    "title": "Article",
                    **flags,
                }
            ]
        }
    }
    catalog = AsyncMock()
    catalog.resolve.return_value = {"id": "frwiki", "domain": "fr.wikipedia.org"}
    result = await MediaWikiContributionsProvider(transport, catalog).page(
        PageRequest(
            usernames=["TestAccount"], project="frwiki", start="2026-01-01", end="2026-01-02"
        )
    )
    assert result["contributions"][0]["new_page"] is expected
    assert result["contributions"][0]["page_id"] == 42

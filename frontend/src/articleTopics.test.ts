import { describe, it, expect } from "vitest";
import {
  articleEdits,
  articleKey,
  creationType,
  creationKey,
  creationStateSummary,
  summarizeArticles,
  wikipediaActivity,
} from "./analysis/articleTopics";
import {
  emptySession,
  type Edit,
  type ArticleTopics,
  type ArticleStatus,
} from "./types";
import { importArchive, importNames } from "./imports";
import { analyzeFollowup } from "./analysis/followup";

const edit = (
  revision: number,
  username = "TestAccount",
  page_id = 42,
): Edit => ({
  username,
  project: "frwiki",
  page_id,
  revision,
  timestamp: "2026-02-03T12:00:00Z",
  namespace: 0,
  title: "Article",
  category: "CONTENT",
  automation: "normal",
  tags: [],
  provider: "mediawiki",
  new_page: revision === 1,
});
const topics: ArticleTopics = {
  project: "frwiki",
  page_id: 42,
  title: "Article",
  first_revision: 1,
  status: "classified",
  model: "outlink-topic-model",
  threshold: 0.5,
  fetched_at: "2026-10-09T12:00:00Z",
  topics: [
    { topic: "STEM.STEM*", score: 0.9 },
    { topic: "STEM.Physics", score: 0.7 },
    { topic: "History_and_Society.History", score: 0.6 },
    { topic: "Culture.Media.Music", score: 0.4 },
  ],
};

describe("article topics", () => {
  it("partitions creation states without adding reused titles twice and respects current filters", () => {
    const session = emptySession();
    session.params.start = session.params.end = "2026-02-01";
    session.catalog = [
      {
        id: "frwiki",
        domain: "fr.wikipedia.org",
        label: "FR",
        family: "wikipedia",
      },
    ];
    const edits = [1, 2, 3].map((revision) => ({
      ...edit(revision, "TestAccount", revision),
      new_page: true,
    }));
    const state = (
      revision: number,
      status: ArticleStatus["status"],
      recreated = false,
    ): ArticleStatus => ({
      project: "frwiki",
      revision,
      title: "Article",
      current_title: "Article",
      page_id: revision,
      status,
      recreated,
      redirect: false,
      disambiguation: false,
      checked_at: "2026-11-20T12:00:00Z",
    });
    session.article_status = {
      [creationKey("frwiki", 1)]: state(1, "online"),
      [creationKey("frwiki", 2)]: state(2, "deleted", true),
      [creationKey("frwiki", 999)]: state(999, "online"),
    };
    const result = { rows: [{ included: true, edits }] } as ReturnType<
      typeof analyzeFollowup
    >;
    const summary = creationStateSummary(result, session);
    expect(summary).toMatchObject({
      total: 3,
      online: 1,
      deleted: 1,
      unconfirmed: 1,
      recreated: 1,
    });
    expect(summary.online + summary.deleted + summary.unconfirmed).toBe(
      summary.total,
    );
    expect(
      creationStateSummary(
        { ...result, rows: [{ ...result.rows[0], edits: [edits[0]] }] },
        session,
      ),
    ).toMatchObject({
      total: 1,
      online: 1,
      deleted: 0,
      unconfirmed: 0,
      recreated: 0,
    });
    expect(importArchive(JSON.stringify(session)).article_status).toEqual(
      session.article_status,
    );
  });
  it("reconciles 40 creations, 23 archives, 2 excluded pages and 15 topic candidates without model-dependent creation totals", () => {
    const s = emptySession();
    s.catalog = [
      {
        id: "frwiki",
        domain: "fr.wikipedia.org",
        label: "FR",
        family: "wikipedia",
      },
    ];
    const edits = Array.from({ length: 40 }, (_, i) => ({
      ...edit(i + 1, "TestAccount", i + 1),
      title: `Page ${i + 1}`,
      new_page: true,
      deleted_page: i < 23,
    }));
    const cache = Object.fromEntries(
      edits.slice(23).map((e, i) => [
        articleKey(e),
        {
          ...topics,
          page_id: e.page_id!,
          first_revision: e.revision,
          status: i < 2 ? "excluded" : i === 2 ? "unavailable" : "classified",
        },
      ]),
    );
    const summary = summarizeArticles(
      edits,
      cache as Record<string, ArticleTopics>,
      "creation",
      "articles",
    );
    expect(summary).toMatchObject({
      articles: 38,
      deleted: 23,
      excluded: 2,
      classified: 14,
      unavailable: 1,
    });
    const result = {
      rows: [{ included: true, edits: [...edits, edits[0]] }],
    } as ReturnType<typeof analyzeFollowup>;
    expect(wikipediaActivity(result, s)).toMatchObject({
      creations: 40,
      deletedCreations: 23,
      modifications: 0,
      unknownType: 0,
    });
    const publicSummary = summarizeArticles(
      edits.filter((e) => !e.deleted_page),
      cache as Record<string, ArticleTopics>,
      "creation",
      "articles",
    );
    expect(publicSummary).toMatchObject({
      articles: 15,
      deleted: 0,
      excluded: 2,
      classified: 14,
      unavailable: 1,
    });
    expect(publicSummary.articles).toBe(
      publicSummary.classified + publicSummary.unavailable,
    );
  });
  it("keeps contributors, articles and revisions separate, with overlap and unclassified denominators", () => {
    const edits = [
      edit(1),
      edit(2),
      edit(3, "OtherAccount"),
      edit(4, "OtherAccount", 43),
    ];
    const cache = { [articleKey(edits[0])]: topics };
    const people = summarizeArticles(edits, cache, "both", "contributors");
    expect(people.base).toBe(2);
    expect(people.rows.find((r) => r.topic === "science")).toMatchObject({
      count: 2,
      percent: 100,
    });
    expect(people.rows.find((r) => r.topic === "history")).toMatchObject({
      count: 2,
      percent: 100,
    });
    expect(people.rows.find((r) => r.topic === "culture")).toBeUndefined();
    expect(people.pending).toBe(1);
    expect(
      summarizeArticles(edits, cache, "both", "articles").rows[0],
    ).toMatchObject({ count: 1, percent: 50 });
    expect(
      summarizeArticles(edits, cache, "both", "edits").rows[0],
    ).toMatchObject({ count: 3, percent: 75 });
  });
  it("filters creation and modification revisions without losing later edits on created articles", () => {
    const edits = [edit(1), edit(2)];
    const cache = { [articleKey(edits[0])]: topics };
    expect(
      summarizeArticles(edits, cache, "creation", "edits").selected,
    ).toHaveLength(1);
    expect(
      summarizeArticles(edits, cache, "modification", "edits").selected,
    ).toHaveLength(1);
    const old = { ...edit(1), new_page: undefined };
    expect(creationType(old)).toBeNull();
    expect(creationType(old, topics)).toBe(true);
    expect(creationType({ ...old, revision: 2 }, topics)).toBe(false);
    expect(
      summarizeArticles([old], {}, "modification", "edits").selected,
    ).toHaveLength(0);
  });
  it("counts failed and empty model responses separately, excludes non-articles, and omits generic detail labels", () => {
    const edits = [
      edit(1),
      edit(2, "TestAccount", 43),
      edit(3, "TestAccount", 44),
      edit(4, "TestAccount", 45),
    ];
    const cache = {
      [articleKey(edits[0])]: topics,
      [articleKey(edits[1])]: {
        ...topics,
        page_id: 43,
        status: "unavailable" as const,
        topics: [],
      },
      [articleKey(edits[2])]: {
        ...topics,
        page_id: 44,
        status: "unclassified" as const,
        topics: [],
      },
      [articleKey(edits[3])]: {
        ...topics,
        page_id: 45,
        status: "excluded" as const,
        topics: [],
      },
    };
    const result = summarizeArticles(edits, cache, "both", "articles", true);
    expect(result).toMatchObject({
      excluded: 1,
      unavailable: 1,
      unclassified: 1,
      classified: 1,
      pending: 0,
      base: 3,
    });
    expect(result.rows.some((r) => r.topic.endsWith("*"))).toBe(false);
  });
  it("uses selected accounts, periods, Wikipedia main namespace and automation filters; deduplicates revisions", () => {
    const s = emptySession();
    s.params.start = s.params.end = "2026-02-01";
    s.params.reference = "2026-10-09";
    s.params.exclude_automation = true;
    s.cohort = importNames("TestAccount\nExcluded").accounts;
    s.cohort[1].included = false;
    s.catalog = [
      {
        id: "frwiki",
        domain: "fr.wikipedia.org",
        label: "FR",
        family: "wikipedia",
      },
      {
        id: "commonswiki",
        domain: "commons.wikimedia.org",
        label: "Commons",
        family: "commons",
      },
    ];
    s.edits = [
      edit(1),
      edit(1),
      { ...edit(2), namespace: 1, category: "COMMUNITY" },
      edit(3, "Excluded"),
      { ...edit(4), automation: "bot" },
      { ...edit(5), project: "commonswiki", category: "MEDIA" },
      { ...edit(6), timestamp: "2025-01-01T00:00:00Z" },
    ];
    expect(articleEdits(analyzeFollowup(s), s)).toHaveLength(1);
    s.article_topics = { [articleKey(edit(1))]: topics };
    const restored = importArchive(JSON.stringify(s));
    expect(restored.article_topics).toEqual(s.article_topics);
    expect(restored.edits[0].new_page).toBe(true);
  });
});

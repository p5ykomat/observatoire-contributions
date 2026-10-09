import { afterEach, expect, it, vi } from "vitest";
import { Collector } from "./collector";
import { analyzeFollowup } from "./analysis/followup";
import { articleKey, summarizeArticles } from "./analysis/articleTopics";
import { signature } from "./analysis/cohorts";
import { importArchive, importNames } from "./imports";
import { emptySession, type Edit } from "./types";

afterEach(() => vi.unstubAllGlobals());

function session() {
  const s = emptySession();
  s.params = {
    ...s.params,
    start: "2026-01-01",
    end: "2026-01-01",
    reference: "2026-02-01",
    scope: "custom",
    projects: ["frwiki"],
  };
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      label: "FR",
      family: "wikipedia",
    },
  ];
  s.taxonomy = {
    version: "1",
    community_suffix: "talk",
    maintenance: [],
    families: { wikipedia: { "": "CONTENT" } },
    projects: {},
    default: "OTHER",
  };
  s.namespaces.frwiki = { "0": { id: 0, canonical: "" } };
  s.cohort = importNames(
    "LiveAccount\nCreationAccount\nModificationAccount",
  ).accounts.map((a) => ({
    ...a,
    exists: true,
    qualified: true,
    registration: "2025-12-30T00:00:00Z",
    pre_complete: true,
    post_complete: true,
    deleted_complete: true,
    deleted_classified: true,
  }));
  s.question = {
    days: 30,
    families: ["*"],
    wikipedia_languages: ["*"],
    wikipedia_categories: ["CONTENT"],
  };
  s.collection_signature = signature(s.params);
  s.deleted_collection_version = 1;
  return s;
}

function edit(
  username: string,
  revision: number,
  deleted_page: boolean,
  new_page: boolean | null,
): Edit {
  return {
    username,
    revision,
    project: "frwiki",
    namespace: 0,
    category: "CONTENT",
    timestamp: "2026-01-03T12:00:00Z",
    title: `Article${revision}`,
    automation: "normal",
    tags: [],
    provider: "mediawiki",
    deleted_page,
    new_page,
  };
}

it("dynamic inclusion changes activity, totals, lists and theme denominators without API calls", () => {
  const s = session();
  s.edits = [
    edit("LiveAccount", 1, false, true),
    edit("CreationAccount", 2, true, true),
    edit("ModificationAccount", 3, true, false),
  ];
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const cache = {
    [articleKey(s.edits[0])]: {
      project: "frwiki",
      title: "Article1",
      page_id: 1,
      first_revision: 1,
      model: "outlink-topic-model" as const,
      threshold: 0.5 as const,
      fetched_at: "2026-02-01T00:00:00Z",
      status: "classified" as const,
      topics: [{ topic: "STEM.Physics", score: 0.8 }],
    },
  };
  let r = analyzeFollowup(s);
  expect(r).toMatchObject({
    active: 3,
    totalEdits: 3,
    rate: 100,
    complete: true,
  });
  let topics = summarizeArticles(
    r.included.flatMap((row) => row.edits),
    cache,
    "creation",
    "articles",
  );
  expect(topics).toMatchObject({
    base: 2,
    deleted: 1,
    pending: 0,
    classified: 1,
  });
  expect(topics.rows[0].percent).toBe(50);
  s.question!.include_deleted_creations = false;
  r = analyzeFollowup(s);
  expect(r).toMatchObject({ active: 2, inactive: 1, totalEdits: 2 });
  expect(r.rows[1].last).toBeNull();
  topics = summarizeArticles(
    r.included.flatMap((row) => row.edits),
    cache,
    "creation",
    "articles",
  );
  expect(topics.rows[0].percent).toBe(100);
  s.question!.include_deleted_modifications = false;
  expect(analyzeFollowup(s)).toMatchObject({
    active: 1,
    inactive: 2,
    totalEdits: 1,
  });
  s.question!.include_deleted_creations =
    s.question!.include_deleted_modifications = true;
  expect(analyzeFollowup(s).totalEdits).toBe(3);
  expect(fetch).not.toHaveBeenCalled();
});

it("archive failures and unknown creation types never silently become inactivity", () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.cohort[0].deleted_complete = false;
  expect(analyzeFollowup(s)).toMatchObject({
    unknown: 1,
    inactive: 0,
    rate: null,
  });
  s.cohort[0].deleted_complete = true;
  s.cohort[0].deleted_classified = false;
  s.edits = [edit("LiveAccount", 1, true, null)];
  expect(analyzeFollowup(s)).toMatchObject({ active: 1, complete: true });
  s.question!.include_deleted_creations = false;
  expect(analyzeFollowup(s).complete).toBe(false);
  s.question!.include_deleted_modifications = false;
  expect(analyzeFollowup(s)).toMatchObject({ inactive: 1, complete: true });
});

it("collection retrieves archived pages, classifies creations once, persists cursors and ignores saved rows outside the new period", async () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.cohort[0].pre_complete = s.cohort[0].post_complete = false;
  s.edits = [
    {
      ...edit("LiveAccount", 100, true, true),
      timestamp: "2008-01-01T12:00:00Z",
    },
  ];
  s.queue = [
    {
      provider: "deleted",
      usernames: ["LiveAccount"],
      project: "frwiki",
      attempts: 0,
    },
  ];
  const requests: { path: string; cursor?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      requests.push({ path: url, cursor: body.cursor });
      if (url.endsWith("deleted-contributions"))
        return Response.json(
          body.cursor
            ? {
                contributions: [edit("LiveAccount", 2, true, null)],
                cursor: null,
              }
            : {
                contributions: [edit("LiveAccount", 1, true, null)],
                cursor: "archive-next",
              },
        );
      return Response.json(
        body.cursor
          ? { revisions: [], cursor: null }
          : { revisions: [1], cursor: "2026-01-03T12:00:00Z" },
      );
    }),
  );
  await new Collector(s, () => {}).run();
  expect(requests.map((r) => r.cursor)).toEqual([
    undefined,
    "archive-next",
    undefined,
    "2026-01-03T12:00:00Z",
  ]);
  expect(s.edits.map((e) => e.new_page)).toEqual([true, true, false]);
  expect(s.cohort[0].post_complete).toBe(true);
  expect(analyzeFollowup(s).totalEdits).toBe(2);
  s.queue = [
    {
      provider: "deleted_creations",
      usernames: ["LiveAccount"],
      project: "frwiki",
      attempts: 0,
      cursor: "2026-01-03T12:00:00Z",
      creation_ids: [1],
    },
  ];
  s.question!.include_deleted_creations = false;
  const restored = importArchive(JSON.stringify(s));
  expect(restored.queue[0].creation_ids).toEqual([1]);
  expect(restored.edits[1].deleted_page).toBe(true);
  expect(restored.question!.include_deleted_creations).toBe(false);
});

it("preparation includes Wikipedia archives and retries archive failures despite completed ordinary revisions", async () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.cohort[0].deleted_complete = false;
  s.catalog.push({
    id: "commonswiki",
    domain: "commons.wikimedia.org",
    label: "Commons",
    family: "commons",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        merged: [
          { wiki: "frwiki", editcount: 1 },
          { wiki: "commonswiki", editcount: 1 },
        ],
      }),
    ),
  );
  await new Collector(s, () => {}).prepare(true);
  expect(
    s.queue.filter((t) => t.provider === "deleted").map((t) => t.project),
  ).toEqual(["frwiki"]);
  expect(
    s.queue.filter((t) => t.provider === "mediawiki").map((t) => t.project),
  ).toEqual(["frwiki", "commonswiki"]);
});

it("a saved archived revision subsequently restored is updated without double counting", () => {
  const s = session();
  s.edits = [edit("LiveAccount", 1, true, true)];
  new Collector(s, () => {}).add([
    { ...s.edits[0], deleted_page: false, provider: "xtools" },
  ]);
  expect(s.edits).toHaveLength(1);
  expect(s.edits[0].deleted_page).toBe(false);
});

it("an archive API failure preserves ordinary completion but blocks a definitive inactivity rate", async () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.queue = [
    {
      provider: "deleted",
      usernames: ["LiveAccount"],
      project: "frwiki",
      attempts: 0,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  await new Collector(s, () => {}).run();
  expect(s.cohort[0].post_complete).toBe(true);
  expect(s.cohort[0].deleted_complete).toBe(false);
  expect(analyzeFollowup(s)).toMatchObject({
    unknown: 1,
    inactive: 0,
    rate: null,
  });
  expect(analyzeFollowup(s).deleted.incomplete).toEqual(["LiveAccount"]);
});

it("failure to identify deleted creations keeps archive metadata rather than relabelling everything as an edit", async () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.edits = [edit("LiveAccount", 1, true, null)];
  s.queue = [
    {
      provider: "deleted_creations",
      usernames: ["LiveAccount"],
      project: "frwiki",
      attempts: 0,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  await new Collector(s, () => {}).run();
  expect(s.edits[0].new_page).toBeNull();
  expect(s.cohort[0].deleted_classified).toBe(false);
  expect(analyzeFollowup(s)).toMatchObject({
    active: 1,
    complete: true,
    totalEdits: 1,
  });
  s.question!.include_deleted_creations = false;
  expect(analyzeFollowup(s).rate).toBeNull();
});

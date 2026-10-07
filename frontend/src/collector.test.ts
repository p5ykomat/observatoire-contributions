import { afterEach, it, expect, vi } from "vitest";
import { Collector } from "./collector";
import { emptySession } from "./types";
import { importNames } from "./imports";
import { signature } from "./analysis/cohorts";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function session() {
  const s = emptySession();
  s.params = {
    ...s.params,
    start: "2021-01-01",
    end: "2021-01-02",
    reference: "2024-01-01",
  };
  s.cohort = importNames("Alice\nBob").accounts.map((a) => ({
    ...a,
    qualified: true,
    exists: true,
    registration: "2020-12-31T00:00:00Z",
  }));
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      label: "fr",
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
  s.namespaces = { frwiki: { "0": { id: 0, canonical: "" } } };
  s.collection_signature = signature(s.params);
  return s;
}
it("pagination, déduplication et secours réel, un échec ne bloque pas le suivant", async () => {
  const s = session();
  s.queue = [
    { provider: "xtools", usernames: ["Alice"], attempts: 0 },
    { provider: "xtools", usernames: ["Bob"], attempts: 0 },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.includes("global-contributions"))
        return body.username === "Alice"
          ? new Response("{}", { status: 404 })
          : Response.json({ rows: [], cursor: null });
      if (url.includes("local-accounts"))
        return Response.json({ merged: [{ wiki: "frwiki", editcount: 10 }] });
      return Response.json({
        contributions: [
          {
            username: "Alice",
            project: "frwiki",
            revision: 1,
            timestamp: "2021-01-03T00:00:00Z",
            namespace: 0,
            title: "A",
            category: "OTHER",
            automation: "normal",
            tags: [],
            provider: "mediawiki",
          },
        ],
        cursor: body.cursor ? null : "next",
      });
    }),
  );
  await new Collector(s, () => {}).run();
  expect(s.cohort[0].technical).toBe("completed_fallback");
  expect(s.cohort[1].technical).toBe("completed_primary");
  expect(s.edits).toHaveLength(1);
  expect(s.edits[0].category).toBe("CONTENT");
});
it("une pagination interrompue conserve ses données partielles", async () => {
  const s = session();
  s.queue = [
    {
      provider: "mediawiki",
      usernames: ["Alice"],
      project: "frwiki",
      attempts: 0,
    },
  ];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ++n === 1
        ? Response.json({
            contributions: [
              {
                username: "Alice",
                project: "frwiki",
                revision: 1,
                timestamp: "2021-01-03T00:00:00Z",
                namespace: 0,
                title: "A",
                category: "OTHER",
                automation: "normal",
                tags: [],
                provider: "mediawiki",
              },
            ],
            cursor: "next",
          })
        : new Response("{}", { status: 404 }),
    ),
  );
  await new Collector(s, () => {}).run();
  expect(s.edits).toHaveLength(1);
  expect(s.cohort[0].technical).toBe("partial");
  expect(s.cohort[0].post_complete).toBe(false);
});
it("les comptes MediaWiki sont regroupés par projet", async () => {
  const s = session();
  s.params.scope = "custom";
  s.params.projects = ["frwiki"];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ merged: [{ wiki: "frwiki", editcount: 1 }] }),
    ),
  );
  await new Collector(s, () => {}).prepare(true);
  expect(s.queue).toHaveLength(1);
  expect(s.queue[0].usernames).toEqual(["Alice", "Bob"]);
});
it("annuler conserve la file et les comptes déjà analysés", async () => {
  const s = session();
  s.queue = [{ provider: "xtools", usernames: ["Alice"], attempts: 0 }];
  const c = new Collector(s, () => {});
  c.pause();
  const running = c.run();
  c.stop();
  await running;
  expect(s.queue).toHaveLength(1);
  expect(s.stage).toBe(4);
});

it("une exclusion manuelle ou une réintégration de l’organisation est conservée à la qualification", async () => {
  const s = session();
  s.cohort[0] = {
    ...s.cohort[0],
    qualified: false,
    staff: true,
    included: true,
  };
  s.cohort[1] = {
    ...s.cohort[1],
    qualified: false,
    included: false,
    exclusion_reason: "Choix manuel",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        s.cohort.map((a) => ({
          username: a.username,
          exists: true,
          bot: false,
          registration: a.registration,
        })),
      ),
    ),
  );
  await new Collector(s, () => {}).qualify();
  expect(s.cohort[0].included).toBe(true);
  expect(s.cohort[1].included).toBe(false);
  expect(s.cohort[1].exclusion_reason).toBe("Choix manuel");
});

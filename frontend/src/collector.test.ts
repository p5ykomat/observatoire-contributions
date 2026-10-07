import { afterEach, it, expect, vi } from "vitest";
import { Collector } from "./collector";
import { emptySession } from "./types";
import { importNames } from "./imports";
import { signature } from "./analysis/cohorts";
import { aggregate } from "./analysis/aggregation";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["all", "origin", "custom"] as const)(
  "%s : seuls les 13 nouveaux comptes retenus sur 18 sont interrogés",
  async (scope) => {
    const s = session();
    s.params = {
      ...s.params,
      start: "2026-05-01",
      end: "2026-07-01",
      reference: "2026-10-07",
      selection: "new",
      creation_range: { start: "2026-01-01", end: "2026-06-01" },
      scope,
      projects: scope === "custom" ? ["frwiki"] : [],
    };
    s.cohort = importNames(
      Array.from({ length: 18 }, (_, index) => `Compte${index}`).join("\n"),
    ).accounts.map((a, index) => ({
      ...a,
      included: index < 15,
      staff: index >= 15,
      qualified: true,
      exists: true,
      registration:
        index < 13 ? "2026-04-03T12:00:00Z" : "2025-12-24T00:00:00Z",
    }));
    const queried: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        queried.push(...(body.usernames ?? [body.username]));
        if (url.includes("local-accounts"))
          return Response.json({ merged: [{ wiki: "frwiki", editcount: 1 }] });
        return Response.json({ rows: [], contributions: [], cursor: null });
      }),
    );
    const collector = new Collector(s, () => {});
    await collector.prepare();
    expect(new Set(s.queue.flatMap((task) => task.usernames))).toEqual(
      new Set(s.cohort.slice(0, 13).map((a) => a.username)),
    );
    await collector.run();
    expect(new Set(queried)).toEqual(
      new Set(s.cohort.slice(0, 13).map((a) => a.username)),
    );
    expect(s.cohort.slice(13).every((a) => !a.post_complete)).toBe(true);
    expect(aggregate(s).n).toBe(13);
    expect(aggregate(s).complete).toBe(true);
  },
);

it("une ancienne file est filtrée sans partager son curseur avec un compte ajouté", async () => {
  const s = session();
  s.params.scope = "custom";
  s.params.projects = ["frwiki"];
  s.collection_signature = signature(s.params);
  s.cohort[1].included = false;
  s.cohort.push({ ...s.cohort[0], username: "Carol" });
  s.queue = [
    {
      provider: "mediawiki",
      usernames: ["Alice", "Bob"],
      project: "frwiki",
      cursor: "next",
      attempts: 0,
    },
  ];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toContain("local-accounts");
    expect(JSON.parse(init.body as string)).toEqual({ usernames: ["Carol"] });
    return Response.json({ merged: [{ wiki: "frwiki", editcount: 1 }] });
  });
  vi.stubGlobal("fetch", fetch);
  await new Collector(s, () => {}).prepare();
  expect(
    s.queue.map((task) => ({ names: task.usernames, cursor: task.cursor })),
  ).toEqual([
    { names: ["Alice"], cursor: "next" },
    { names: ["Carol"], cursor: undefined },
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
    usernames: ["Carol"],
  });
});

it("réintégrer un compte collecte ses données sans réinterroger les comptes terminés", async () => {
  const s = session();
  s.cohort[1].included = false;
  const queried: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      queried.push(JSON.parse(init.body as string).username);
      return Response.json({ rows: [], cursor: null });
    }),
  );
  let collector = new Collector(s, () => {});
  await collector.prepare();
  await collector.run();
  expect(queried).toEqual(["Alice"]);
  s.cohort[1].included = true;
  expect(aggregate(s).complete).toBe(false);
  collector = new Collector(s, () => {});
  await collector.prepare(true);
  await collector.run();
  expect(queried).toEqual(["Alice", "Bob"]);
  expect(aggregate(s).complete).toBe(true);
});

it("un changement de dates invalide aussi la couverture des comptes momentanément exclus", async () => {
  const s = session();
  s.cohort.forEach((a) => {
    a.pre_complete = true;
    a.post_complete = true;
  });
  s.cohort[1].included = false;
  s.params.end = "2021-01-03";
  await new Collector(s, () => {}).prepare();
  expect(s.cohort[1].post_complete).toBe(false);
  s.cohort[1].included = true;
  await new Collector(s, () => {}).prepare();
  expect(s.queue.flatMap((task) => task.usernames)).toEqual(["Alice", "Bob"]);
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
it("tous les projets collecte aussi des éditions anglaises et Commons avec une sélection personnalisée vide", async () => {
  const s = session();
  s.cohort = s.cohort.slice(0, 1);
  s.params.scope = "all";
  s.params.projects = [];
  s.catalog.push(
    {
      id: "enwiki",
      domain: "en.wikipedia.org",
      label: "English",
      family: "wikipedia",
    },
    {
      id: "commonswiki",
      domain: "commons.wikimedia.org",
      label: "Commons",
      family: "commons",
    },
  );
  s.namespaces.enwiki = { "0": { id: 0, canonical: "" } };
  s.namespaces.commonswiki = { "6": { id: 6, canonical: "File" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.includes("global-contributions"))
        throw new Error(
          "La collecte globale ne doit pas être limitée au projet d’origine",
        );
      return Response.json({
        rows: [
          {
            username: "Alice",
            project: "en.wikipedia.org",
            rev_id: 1,
            timestamp: "2021-01-03T00:00:00Z",
            namespace: 0,
            page_title: "Article",
          },
          {
            username: "Alice",
            project: "commons.wikimedia.org",
            rev_id: 1,
            timestamp: "2021-01-04T00:00:00Z",
            namespace: 6,
            page_title: "File:Image",
          },
        ],
        cursor: null,
      });
    }),
  );
  const collector = new Collector(s, () => {});
  await collector.prepare(true);
  await collector.run();
  expect(s.edits.map((edit) => edit.project)).toEqual([
    "enwiki",
    "commonswiki",
  ]);
  expect(s.cohort[0].post_complete).toBe(true);
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

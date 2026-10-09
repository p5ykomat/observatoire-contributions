import { afterEach, describe, expect, it, vi } from "vitest";
import { importArchive, importNames } from "./imports";
import { emptySession, type Edit } from "./types";
import { signature } from "./analysis/cohorts";
import { analyzeFollowup } from "./analysis/followup";
import { registrationSummary } from "./analysis/registrationSummary";
import { Collector } from "./collector";
import { loadRegistrations, registrationImport } from "./registrationImporter";

function session() {
  const s = emptySession();
  s.new_accounts = {
    start: "2026-01-01",
    end: "2026-01-13",
    unavailable: 0,
    excluded: 0,
  };
  s.params = {
    ...s.params,
    start: "2026-01-01",
    end: "2026-01-13",
    reference: "2026-03-30",
    scope: "all",
    observation: { mode: "period", start: "2026-03-01", end: "2026-03-30" },
  };
  s.question = {
    days: "today",
    families: ["*"],
    wikipedia_languages: ["*"],
    wikipedia_categories: ["CONTENT"],
    projects: ["commonswiki", "frwiki", "wikidatawiki"],
  };
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      label: "fr",
      family: "wikipedia",
    },
    {
      id: "commonswiki",
      domain: "commons.wikimedia.org",
      label: "Commons",
      family: "commons",
    },
    {
      id: "wikidatawiki",
      domain: "www.wikidata.org",
      label: "Wikidata",
      family: "wikidata",
    },
  ];
  s.cohort = importNames("NewRegistered\nNoEdits").accounts.map((a, index) => ({
    ...a,
    registration: "2026-01-13T10:00:00Z",
    signup: {
      timestamp: "2026-01-13T10:00:00Z",
      local_id: index + 1,
      original_name: a.username,
    },
    qualified: true,
    exists: true,
    pre_complete: true,
    post_complete: true,
    technical: "completed_primary" as const,
  }));
  s.collection_signature = signature(s.params);
  return s;
}
const edit = (
  revision: number,
  project: string,
  timestamp: string,
  category: Edit["category"] = "CONTENT",
): Edit => ({
  username: "NewRegistered",
  revision,
  project,
  timestamp,
  namespace: 0,
  title: "Public page",
  category,
  automation: "normal",
  tags: [],
  provider: "mediawiki",
});
afterEach(() => vi.unstubAllGlobals());

describe("registration observation", () => {
  it("counts a person once overall, per project, keeps zero edits in the denominator and excludes edits outside the interval", () => {
    const s = session();
    s.edits = [
      edit(1, "frwiki", "2026-02-28T23:59:59Z"),
      edit(2, "frwiki", "2026-03-01T00:00:00Z"),
      edit(3, "commonswiki", "2026-03-30T23:59:59Z", "MEDIA"),
      edit(4, "frwiki", "2026-03-31T00:00:00Z"),
      edit(5, "frwiki", "2026-03-10T12:00:00Z", "COMMUNITY"),
    ];
    const r = analyzeFollowup(s);
    expect([r.n, r.active, r.inactive, r.totalEdits, r.rate]).toEqual([
      2, 1, 1, 2, 50,
    ]);
    expect(r.byFamily.filter((f) => f.active).map((f) => f.percent)).toEqual([
      50, 50,
    ]);
    expect(registrationSummary(s)).toContain("50 %");
  });
  it("starts at each registration timestamp, not the start of the whole registration range", () => {
    const s = session();
    s.params.observation = {
      mode: "registration",
      start: "2026-01-01",
      end: "2026-03-30",
    };
    s.collection_signature = signature(s.params);
    s.edits = [
      edit(1, "frwiki", "2026-01-13T09:59:59Z"),
      edit(2, "wikidatawiki", "2026-01-13T10:00:00Z", "STRUCTURED_DATA"),
    ];
    expect(analyzeFollowup(s).totalEdits).toBe(1);
  });
  it("observes Commons only when every Wikipedia language and Wikidata are deselected", () => {
    const s = session();
    s.question!.projects = ["commonswiki"];
    s.edits = [
      edit(1, "frwiki", "2026-03-10T12:00:00Z"),
      edit(2, "commonswiki", "2026-03-10T12:00:00Z", "OTHER"),
    ];
    expect(analyzeFollowup(s).projects.map((p) => p.id)).toEqual([
      "commonswiki",
    ]);
    expect(analyzeFollowup(s).totalEdits).toBe(1);
  });
  it("does not interpret a failed retrieval as zero activity", () => {
    const s = session();
    s.cohort[1].post_complete = false;
    const r = analyzeFollowup(s);
    expect(r.unknown).toBe(1);
    expect(r.rate).toBeNull();
    expect(registrationSummary(s)).toContain("sans conclusion définitive");
  });
  it("round-trips provenance, individual signup dates and observation in JSON", () => {
    const s = session();
    const restored = importArchive(JSON.stringify(s));
    expect(restored.new_accounts).toEqual(s.new_accounts);
    expect(restored.params.observation).toEqual(s.params.observation);
    expect(restored.cohort[0].signup).toEqual(s.cohort[0].signup);
  });
  it("uses MediaWiki discovery for all projects, preserves idle accounts, and does not call XTools", async () => {
    const s = session();
    s.question!.projects = undefined;
    s.taxonomy = {
      version: "1.0",
      community_suffix: "talk",
      maintenance: [],
      families: {},
      projects: {},
      default: "OTHER",
    };
    s.cohort.forEach((a) => {
      a.post_complete = false;
      a.pre_complete = false;
    });
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        requests.push(url);
        const body = JSON.parse(String(options.body));
        return new Response(
          JSON.stringify({
            merged:
              body.usernames[0] === "NewRegistered"
                ? [{ wiki: "wikidatawiki", editcount: 3 }]
                : [],
          }),
          { status: 200 },
        );
      }),
    );
    const engine = new Collector(s, () => {});
    await engine.prepare();
    expect(s.queue.map((t) => [t.provider, t.project, t.usernames])).toEqual([
      ["mediawiki", "wikidatawiki", ["NewRegistered"]],
    ]);
    expect(s.cohort[1].post_complete).toBe(true);
    expect(requests).not.toContain("/api/global-contributions");
  });
  it("keeps the local signup date when global unification happened later", async () => {
    const s = session();
    s.cohort = s.cohort.slice(0, 1);
    s.cohort[0].qualified = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                username: "NewRegistered",
                registration: "2026-02-01T00:00:00Z",
                exists: true,
              },
            ]),
          ),
      ),
    );
    await new Collector(s, () => {}).qualify();
    expect(s.cohort[0].registration).toBe("2026-01-13T10:00:00Z");
    expect(s.cohort[0].included).toBe(true);
  });
});

it("resumes a failed verification without skipping the page or duplicating accounts", async () => {
  const state = registrationImport("2026-01-13", "2026-01-13");
  const candidate = {
    name: "NewRegistered",
    local_id: 1,
    log_id: 1,
    timestamp: "2026-01-13T10:00:00Z",
  };
  let fail = true;
  const requestedActions: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts: RequestInit) => {
      const body = JSON.parse(String(opts.body));
      if (url.endsWith("/verify")) {
        if (fail) return new Response("{}", { status: 422 });
        return new Response(
          JSON.stringify({
            accounts: [session().cohort[0]],
            unavailable: [],
            excluded: 0,
          }),
        );
      }
      requestedActions.push(body.action);
      return new Response(
        JSON.stringify({
          candidates: body.action === "create" ? [candidate] : [],
          unavailable: 0,
          cursor: null,
        }),
      );
    }),
  );
  await expect(
    loadRegistrations(state, () => {}, new AbortController().signal),
  ).rejects.toThrow();
  expect(state.pending).toHaveLength(1);
  fail = false;
  await loadRegistrations(state, () => {}, new AbortController().signal);
  expect(requestedActions).toEqual(["create", "create2", "byemail"]);
  expect(state.accounts).toHaveLength(1);
  expect(state.complete).toBe(true);
});

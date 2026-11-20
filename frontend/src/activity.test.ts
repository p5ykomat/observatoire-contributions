import { describe, it, expect } from "vitest";
import {
  activityDays,
  projectActivity,
  weekdayActivity,
  contributionURL,
} from "./analysis/activity";
import { analyzeFollowup } from "./analysis/followup";
import { signature } from "./analysis/cohorts";
import { importNames, importArchive } from "./imports";
import { emptySession, defaultQuestion, type Edit } from "./types";

function fixture() {
  const s = emptySession();
  s.params = {
    ...s.params,
    start: "2026-11-06",
    end: "2026-11-06",
    reference: "2026-11-20",
    scope: "custom",
    projects: ["frwiki", "commonswiki"],
    observation: { mode: "period", start: "2026-11-13", end: "2026-11-20" },
  };
  s.new_accounts = {
    start: "2026-11-06",
    end: "2026-11-06",
    unavailable: 0,
    excluded: 0,
  };
  s.question = {
    ...defaultQuestion(),
    days: "today",
    projects: ["frwiki", "commonswiki"],
    wikipedia_languages: ["*"],
  };
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      family: "wikipedia",
      label: "fr",
    },
    {
      id: "commonswiki",
      domain: "commons.wikimedia.org",
      family: "commons",
      label: "Commons",
    },
    {
      id: "wikidatawiki",
      domain: "www.wikidata.org",
      family: "wikidata",
      label: "Wikidata",
    },
  ];
  s.cohort = importNames("One\nTwo").accounts.map((a, i) => ({
    ...a,
    exists: true,
    qualified: true,
    registration: "2026-11-06T10:00:00Z",
    signup: {
      local_id: i + 1,
      original_name: a.username,
      timestamp: "2026-11-06T10:00:00Z",
    },
    post_complete: true,
    pre_complete: true,
    deleted_complete: true,
    deleted_classified: true,
  }));
  s.collection_signature = signature(s.params);
  s.deleted_collection_version = 1;
  return s;
}
const edit = (
  revision: number,
  date: string,
  project = "frwiki",
  username = "One",
): Edit => ({
  revision,
  timestamp: date,
  project,
  username,
  namespace: 0,
  title: "Article",
  category: "CONTENT",
  automation: "normal",
  tags: [],
  provider: "mediawiki",
});
describe("observed contribution analysis", () => {
  it("deduplicates people across projects while contribution shares total 100 percent", () => {
    const s = fixture();
    const rows = projectActivity(
      [
        edit(1, "2026-11-13T10:00:00Z"),
        edit(2, "2026-11-13T11:00:00Z", "commonswiki"),
        edit(3, "2026-11-14T11:00:00Z", "frwiki", "Two"),
      ],
      s.catalog,
    );
    expect(rows.map((p) => [p.count, p.contributors])).toEqual([
      [2, 2],
      [1, 1],
    ]);
    expect(rows.reduce((n, p) => n + p.percent, 0)).toBeCloseTo(100);
  });
  it("compares two Fridays with one Saturday using per-day averages", () => {
    const rows = weekdayActivity(
      [
        edit(1, "2026-11-13T10:00:00Z"),
        edit(2, "2026-11-20T10:00:00Z"),
        edit(3, "2026-11-14T10:00:00Z"),
        edit(4, "2026-11-14T11:00:00Z"),
      ],
      "2026-11-13",
      "2026-11-20",
    );
    expect(rows[4]).toMatchObject({
      days: 2,
      count: 2,
      average: 1,
      contributors: 1,
    });
    expect(rows[5]).toMatchObject({ days: 1, count: 2, average: 2 });
  });
  it("uses UTC days across midnight and keeps repeated contributions on the same date", () => {
    const grouped = activityDays([
      edit(1, "2026-11-14T00:30:00+01:00"),
      edit(2, "2026-11-13T23:45:00Z"),
    ]);
    expect(grouped.get("2026-11-13")).toHaveLength(2);
    expect(grouped.has("2026-11-14")).toBe(false);
  });
  it("keeps a narrowed legacy archive complete without re-collection", () => {
    const s = fixture();
    s.edits = [
      edit(1, "2026-11-13T10:00:00Z"),
      edit(2, "2026-11-19T10:00:00Z"),
    ];
    s.params.observation!.end = "2026-11-17";
    s.params.reference = "2026-11-17";
    s.params.projects = ["frwiki"];
    s.question!.projects = ["frwiki"];
    const r = analyzeFollowup(s);
    expect(r).toMatchObject({
      complete: true,
      totalEdits: 1,
      active: 1,
      inactive: 1,
      unknown: 0,
      collectedUntil: "2026-11-20",
      scopeCovered: true,
    });
    expect(analyzeFollowup(importArchive(JSON.stringify(s))).complete).toBe(
      true,
    );
  });
  it("does not claim inactivity when expanding beyond collected dates or projects", () => {
    const s = fixture();
    s.params.observation!.start = "2026-11-12";
    expect(analyzeFollowup(s)).toMatchObject({
      complete: false,
      inactive: 0,
      unknown: 2,
    });
    s.params.observation!.start = "2026-11-13";
    s.params.observation!.end = "2026-11-21";
    s.params.reference = "2026-11-21";
    expect(analyzeFollowup(s)).toMatchObject({
      reached: false,
      complete: false,
    });
    s.params.observation!.end = "2026-11-20";
    s.question!.projects = ["wikidatawiki"];
    expect(analyzeFollowup(s)).toMatchObject({
      scopeCovered: false,
      complete: false,
      inactive: 0,
    });
  });
  it("builds public revision and deletion links and rejects arbitrary domains", () => {
    const s = fixture();
    expect(contributionURL(edit(42, "2026-11-13T10:00:00Z"), s.catalog)).toBe(
      "https://fr.wikipedia.org/w/index.php?diff=42",
    );
    expect(
      contributionURL(
        { ...edit(42, "2026-11-13T10:00:00Z"), deleted_page: true },
        s.catalog,
      ),
    ).toContain("Special:Log&type=delete");
    s.catalog[0].domain = "example.com";
    expect(
      contributionURL(edit(1, "2026-11-13T10:00:00Z"), s.catalog),
    ).toBeNull();
  });
});

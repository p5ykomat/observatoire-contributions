import { expect, it, vi, afterEach } from "vitest";
import { emptySession, type Edit } from "./types";
import { importNames } from "./imports";
import { analyzeFollowup } from "./analysis/followup";
import { resultNotices } from "./analysis/resultNotices";
import { makePDF } from "./exports";
import { signature } from "./analysis/cohorts";
import i18n from "./i18n";

afterEach(() => vi.useRealTimers());

it("une panne de classement indique la donnée manquante et conserve les contributions", () => {
  const s = fixture();
  s.cohort[0].post_complete = false;
  s.cohort[0].technical = "partial";
  s.cohort[0].warnings = [
    i18n.t("collectionNamespaceUnavailable", { project: "www.wikidata.org" }),
  ];
  s.edits = [edit("2021-01-03")];
  const result = analyzeFollowup(s);
  expect(result.totalEdits).toBe(1);
  expect(resultNotices(s, result).map((n) => [n.key, n.accounts])).toEqual([
    ["fup.collectionClassification", ["Alice"]],
  ]);
});

function fixture() {
  const s = emptySession();
  s.params = {
    ...s.params,
    start: "2021-01-01",
    end: "2021-01-02",
    reference: "2026-01-01",
  };
  s.cohort = importNames("Alice\nBob").accounts.map((a) => ({
    ...a,
    exists: true,
    qualified: true,
    post_complete: true,
    pre_complete: true,
  }));
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      family: "wikipedia",
      label: "Français",
    },
  ];
  s.collection_signature = signature(s.params);
  return s;
}
function edit(date: string): Edit {
  return {
    username: "Alice",
    project: "frwiki",
    revision: 1,
    timestamp: date + "T12:00:00Z",
    namespace: 0,
    title: "Article",
    category: "CONTENT",
    automation: "normal",
    tags: [],
    provider: "mediawiki",
  };
}

it("un secours entièrement récupéré ne produit aucune erreur", () => {
  const s = fixture();
  s.question = {
    days: 30,
    families: ["*"],
    wikipedia_languages: ["fr"],
    wikipedia_categories: ["CONTENT"],
  };
  s.cohort.forEach((a) => {
    a.providers = ["fallback"];
    a.technical = "completed_fallback";
  });
  const r = analyzeFollowup(s);
  expect(r.collection.completed).toBe(2);
  expect(resultNotices(s, r)).toEqual([]);
});

it("une échéance future ne rend pas la collecte des comptes incomplète", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2021-02-01T12:00:00Z"));
  const s = fixture();
  s.params.reference = "2021-02-01";
  s.collection_signature = signature(s.params);
  s.question = {
    days: 120,
    families: ["*"],
    wikipedia_languages: ["fr"],
    wikipedia_categories: ["CONTENT"],
  };
  const r = analyzeFollowup(s);
  expect(r.collection.completed).toBe(2);
  expect(resultNotices(s, r).map((n) => [n.key, n.error])).toEqual([
    ["fup.futureDeadline", false],
  ]);
  expect(r.rate).toBeNull();
});

it("un échec réel conserve les observations et ne signale que les comptes retenus concernés", () => {
  const s = fixture();
  s.cohort[0].post_complete = false;
  s.cohort[0].technical = "partial";
  s.cohort[1].included = false;
  s.cohort[1].post_complete = false;
  s.cohort[1].technical = "failed";
  s.edits = [edit("2021-01-03")];
  const r = analyzeFollowup(s);
  const notices = resultNotices(s, r);
  expect(r.totalEdits).toBe(1);
  expect(notices).toEqual([
    {
      key: "fup.collectionUnavailable",
      values: { count: 1 },
      accounts: ["Alice"],
      error: true,
    },
  ]);
  expect(makePDF(s).output()).not.toContain("(Alice)");
  expect(makePDF(s, true).output()).toContain("Alice");
});

it("une collecte interrompue et un compte non vérifié ont des causes distinctes", () => {
  const s = fixture();
  s.cohort[0].post_complete = false;
  s.cohort[0].technical = "pending";
  s.cohort[1].exists = null;
  s.cohort[1].qualified = false;
  const notices = resultNotices(s, analyzeFollowup(s));
  expect(notices.map((n) => [n.key, n.accounts, n.error])).toEqual([
    ["fup.collectionUnverified", ["Bob"], true],
    ["fup.collectionUnfinished", ["Alice"], false],
  ]);
});

it("un périmètre non collecté ou des paramètres modifiés ne sont pas des erreurs de compte", () => {
  const s = fixture();
  s.params.scope = "origin";
  s.collection_signature = signature(s.params);
  s.catalog.push({
    id: "commonswiki",
    domain: "commons.wikimedia.org",
    family: "commons",
    label: "Commons",
  });
  expect(
    resultNotices(s, analyzeFollowup(s)).map((n) => [n.key, n.error]),
  ).toEqual([["fup.missingScope", false]]);
  s.params.reference = "2024-02-01";
  const notices = resultNotices(s, analyzeFollowup(s));
  expect(notices.map((n) => n.key)).toEqual([
    "fup.missingScope",
    "fup.changedCollection",
  ]);
  expect(notices.every((n) => !n.error && !n.accounts.length)).toBe(true);
});

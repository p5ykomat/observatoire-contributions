import { describe, it, expect, vi, afterEach } from "vitest";
import { emptySession, defaultQuestion, type Edit } from "./types";
import { importNames, importArchive } from "./imports";
import { signature } from "./analysis/cohorts";
import { analyzeFollowup } from "./analysis/followup";
function fixture() {
  const s = emptySession();
  s.params.start = s.params.end = "2026-04-03";
  s.params.reference = "2026-10-07";
  s.question = defaultQuestion();
  s.cohort = importNames("Alice\nBob").accounts.map((a) => ({
    ...a,
    exists: true,
    qualified: true,
    post_complete: true,
  }));
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      label: "Fr",
      family: "wikipedia",
    },
    {
      id: "enwiki",
      domain: "en.wikipedia.org",
      label: "En",
      family: "wikipedia",
    },
    {
      id: "brwiki",
      domain: "br.wikipedia.org",
      label: "Breton",
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
  s.collection_signature = signature(s.params);
  return s;
}
function edit(
  date: string,
  project = "frwiki",
  category: Edit["category"] = "CONTENT",
  username = "Alice",
): Edit {
  return {
    username,
    project,
    revision: Number(date.replaceAll("-", "")),
    timestamp: date + "T23:59:59Z",
    namespace: 0,
    title: "Page",
    category,
    automation: "normal",
    tags: [],
    provider: "mediawiki",
  };
}
afterEach(() => vi.useRealTimers());
describe("question cumulative après l’événement", () => {
  it("J+30 inclut J+1 et J+30, écarte le jour de fin et J+31", () => {
    const s = fixture();
    s.edits = [
      edit("2026-04-03"),
      edit("2026-04-04"),
      edit("2026-05-03"),
      edit("2026-05-04"),
    ];
    const r = analyzeFollowup(s);
    expect(r.start).toBe("2026-04-04");
    expect(r.end).toBe("2026-05-03");
    expect(r.totalEdits).toBe(2);
    expect(r.active).toBe(1);
    expect(r.inactive).toBe(1);
    expect(r.rate).toBe(50);
  });
  it("une contribution précoce reste comptée à J+90, sans fenêtre glissante", () => {
    const s = fixture();
    s.edits = [edit("2026-04-05")];
    s.question!.days = 90;
    expect(analyzeFollowup(s).active).toBe(1);
    expect(analyzeFollowup(s).end).toBe("2026-07-02");
  });
  it("Aujourd’hui inclut toutes les contributions observées jusqu’à aujourd’hui", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T16:00:00Z"));
    const s = fixture();
    s.question!.days = "today";
    s.edits = [edit("2026-04-04"), edit("2026-10-07"), edit("2026-10-08")];
    const r = analyzeFollowup(s);
    expect(r.totalEdits).toBe(2);
    expect(r.end).toBe("2026-10-07");
    expect(r.complete).toBe(true);
  });
  it("une archive ancienne ne devient pas complète en choisissant Aujourd’hui", () => {
    const s = fixture();
    s.params.reference = "2026-04-20";
    s.collection_signature = signature(s.params);
    s.question!.days = "today";
    const r = analyzeFollowup(s);
    expect(r.rate).toBeNull();
    expect(r.inactive).toBe(0);
    expect(r.unknown).toBe(2);
  });
  it("une échéance future montre les observations, sans classer les autres inactifs", () => {
    const s = fixture();
    s.question!.days = 365;
    s.edits = [edit("2026-04-10")];
    const r = analyzeFollowup(s);
    expect(r.active).toBe(1);
    expect(r.inactive).toBe(0);
    expect(r.unknown).toBe(1);
    expect(r.rate).toBeNull();
  });
  it("filtre Wikipédia par langue et type, toutes les catégories sur les autres projets", () => {
    const s = fixture();
    s.edits = [
      edit("2026-04-05", "frwiki", "COMMUNITY"),
      edit("2026-04-06", "enwiki"),
      edit("2026-04-07", "brwiki"),
      edit("2026-04-08", "commonswiki", "COMMUNITY"),
      edit("2026-04-09", "wikidatawiki", "MAINTENANCE"),
    ];
    expect(analyzeFollowup(s).totalEdits).toBe(3);
    s.question!.wikipedia_languages.push("br");
    s.question!.wikipedia_categories.push("COMMUNITY");
    expect(analyzeFollowup(s).totalEdits).toBe(5);
  });
  it("compte une personne une fois au total, et une fois par projet fréquenté", () => {
    const s = fixture();
    s.edits = [
      edit("2026-04-05"),
      edit("2026-04-06"),
      edit("2026-04-07", "wikidatawiki", "STRUCTURED_DATA"),
    ];
    const r = analyzeFollowup(s);
    expect(r.active).toBe(1);
    expect(r.totalEdits).toBe(3);
    expect(r.byFamily.find((f) => f.family === "wikipedia")?.active).toBe(1);
    expect(r.byFamily.find((f) => f.family === "wikidata")?.percent).toBe(50);
  });
  it("une collecte partielle ne prouve pas l’absence d’activité", () => {
    const s = fixture();
    s.cohort[1].post_complete = false;
    const r = analyzeFollowup(s);
    expect(r.inactive).toBe(1);
    expect(r.unknown).toBe(1);
    expect(r.rate).toBeNull();
  });
  it("changer de projets après une collecte limitée exige de compléter la couverture", () => {
    const s = fixture();
    s.params.scope = "origin";
    s.collection_signature = signature(s.params);
    s.question!.families = ["wikipedia"];
    s.question!.wikipedia_languages = ["fr"];
    expect(analyzeFollowup(s).complete).toBe(true);
    s.question!.families = ["*"];
    expect(analyzeFollowup(s).scopeCovered).toBe(false);
    expect(analyzeFollowup(s).inactive).toBe(0);
  });
  it("exclusions, automatisation et nouveaux comptes se recalculent sans toucher aux révisions", () => {
    const s = fixture();
    s.edits = [
      { ...edit("2026-04-05"), automation: "bot" },
      edit("2026-04-06", "frwiki", "CONTENT", "Bob"),
    ];
    s.params.exclude_automation = true;
    s.cohort[1].included = false;
    expect(analyzeFollowup(s).active).toBe(0);
    expect(s.edits).toHaveLength(2);
    s.params.selection = "new";
    s.cohort[0].registration = "2026-04-03";
    expect(analyzeFollowup(s).n).toBe(1);
  });
  it("valide la saisie, la sélection vide et le dénominateur nul", () => {
    const s = fixture();
    s.question!.days = 0;
    expect(analyzeFollowup(s).valid).toBe(false);
    s.question!.days = 30;
    s.question!.families = [];
    expect(analyzeFollowup(s).enabled).toBe(false);
    s.cohort = [];
    expect(analyzeFollowup(s).rate).toBeNull();
  });
  it("la question se conserve dans le JSON et les archives sans question restent lisibles", () => {
    const s = fixture();
    s.question!.days = "today";
    s.question!.wikipedia_languages = ["br"];
    expect(importArchive(JSON.stringify(s)).question).toEqual(s.question);
    delete s.question;
    expect(analyzeFollowup(importArchive(JSON.stringify(s))).question).toEqual(
      defaultQuestion(),
    );
  });
});

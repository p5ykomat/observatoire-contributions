import { describe, it, expect } from "vitest";
import { emptySession, type Edit } from "./types";
import { importNames, parseCSV, importArchive } from "./imports";
import { segment, signature } from "./analysis/cohorts";
import { aggregate } from "./analysis/aggregation";
import { temporal, HORIZONS } from "./analysis/retention";
import { classify } from "./analysis/taxonomy";
import { csvText, makePDF } from "./exports";
function fixture() {
  const s = emptySession();
  s.params = {
    ...s.params,
    title: "Atelier",
    start: "2021-01-01",
    end: "2021-01-02",
    reference: "2026-01-01",
  };
  s.cohort = importNames("Alice\nBob").accounts.map((a) => ({
    ...a,
    registration: "2020-12-28T00:00:00Z",
    exists: true,
    qualified: true,
    pre_complete: true,
    post_complete: true,
    technical: "completed_primary",
  }));
  s.collection_signature = signature(s.params);
  return s;
}

it("annuler ne réduit pas les participants retenus au nombre de collectes terminées", () => {
  const s = fixture();
  s.cohort = importNames(
    Array.from({ length: 100 }, (_, i) => "Compte" + i).join("\n"),
  ).accounts.map((a, i) => ({
    ...a,
    exists: true,
    qualified: true,
    pre_complete: i < 29,
    post_complete: i < 29,
    technical: i < 29 ? "completed_primary" : "pending",
  }));
  const r = aggregate(s);
  expect(r.n).toBe(100);
  expect(r.included.filter((a) => a.complete)).toHaveLength(29);
  expect(r.complete).toBe(false);
  expect(r.periods[0].rate).toBeNull();
});
function edit(
  day: string,
  project = "frwiki",
  username = "Alice",
  category: Edit["category"] = "CONTENT",
): Edit {
  return {
    username,
    project,
    revision: Number(day.replaceAll("-", "")),
    timestamp: day + "T12:00:00Z",
    namespace: 0,
    title: "Page",
    category,
    automation: "normal",
    tags: [],
    provider: "mediawiki",
  };
}
describe("imports et archivage", () => {
  it("normalise sans confondre la casse des caractères suivants", () => {
    const r = importNames("alice_bob\nAlice bob\nALICE bob\n\n<invalid>");
    expect(r.accounts.map((a) => a.username)).toEqual([
      "Alice bob",
      "ALICE bob",
    ]);
    expect(r.diagnostics).toHaveLength(3);
  });
  it.each([",", ";", "\t"])(
    "lit un CSV %s avec guillemets et BOM",
    (delimiter) => {
      expect(
        parseCSV(
          "\uFEFFname" + delimiter + 'team\n"Alice"' + delimiter + '"A"',
        )[1][0],
      ).toBe("Alice");
    },
  );
  it("refuse les guillemets malformés", () =>
    expect(() => parseCSV('name\n"Alice')).toThrow());
  it("réimporte un JSON versionné et refuse les fausses valeurs", () => {
    const s = fixture();
    expect(importArchive(JSON.stringify(s)).cohort).toHaveLength(2);
    expect(() =>
      importArchive(JSON.stringify({ ...s, schema_version: "2" })),
    ).toThrow();
    expect(() =>
      importArchive(JSON.stringify({ ...s, cohort: [{ username: "bad" }] })),
    ).toThrow();
  });
  it("exporte des CSV Excel sans injection de formule", () => {
    const csv = csvText([{ name: '=HYPERLINK("x")', n: 4 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(";");
  });
});
describe("qualification et filtres", () => {
  it("J-30 autour du 1er juillet inclut juin et le début, sans comptes plus anciens ni lendemain", () => {
    const s = fixture();
    s.params.start = "2026-07-01";
    s.params.creation_before = 30;
    s.params.creation_after = 0;
    s.params.selection = "new";
    for (const date of ["2026-06-01", "2026-06-30", "2026-07-01"]) {
      expect(
        segment(
          { ...s.cohort[0], registration: date + "T23:59:59Z" },
          [],
          s.params,
        ),
      ).toBe("new");
    }
    for (const date of ["2025-02-18", "2026-05-31", "2026-07-02"]) {
      expect(
        segment({ ...s.cohort[0], registration: date }, [], s.params),
      ).not.toBe("new");
    }
  });
  it("la plage personnalisée utilise les deux bornes et survit à l’export JSON", () => {
    const s = fixture();
    s.params.creation_range = { start: "2020-12-01", end: "2020-12-28" };
    const restored = importArchive(JSON.stringify(s));
    expect(restored.params.creation_range).toEqual(s.params.creation_range);
    for (const date of ["2020-12-01", "2020-12-28"])
      expect(
        segment({ ...s.cohort[0], registration: date }, [], restored.params),
      ).toBe("new");
    for (const date of ["2020-11-30", "2020-12-29", "2021-01-01"])
      expect(
        segment({ ...s.cohort[0], registration: date }, [], restored.params),
      ).not.toBe("new");
    expect(() =>
      importArchive(
        JSON.stringify({
          ...s,
          params: {
            ...s.params,
            creation_range: { start: "2021-01-01", end: "2020-12-01" },
          },
        }),
      ),
    ).toThrow();
  });
  it("60 et 70 jours avant le 26 février expliquent le compte de décembre, sans retenir celui de mars", () => {
    const s = fixture();
    s.params.start = "2026-02-26";
    s.params.creation_after = 0;
    s.params.creation_before = 60;
    const account = { ...s.cohort[0], registration: "2025-12-24T13:46:49Z" };
    expect(segment(account, [], s.params)).not.toBe("new");
    s.params.creation_before = 70;
    expect(segment(account, [], s.params)).toBe("new");
    expect(
      segment(
        { ...account, registration: "2026-03-29T15:02:42Z" },
        [],
        s.params,
      ),
    ).not.toBe("new");
  });
  it.each([0, 7, 14, 30, 42])(
    "respecte la fenêtre J-%i et sa borne",
    (before) => {
      const s = fixture();
      s.params.creation_before = before;
      const date = new Date(
        Date.parse(s.params.start) - before * 86400000,
      ).toISOString();
      expect(
        segment({ ...s.cohort[0], registration: date }, [], s.params),
      ).toBe("new");
    },
  );
  it("classe nouveaux, réactivés, actifs, création hors fenêtre et inconnus", () => {
    const s = fixture(),
      a = s.cohort[0];
    expect(segment(a, [], s.params)).toBe("new");
    const old = { ...a, registration: "2010-01-01T00:00:00Z" };
    expect(segment(old, [], s.params)).toBe("reactivated");
    expect(
      segment(
        old,
        [edit("2020-12-01"), edit("2020-12-02"), edit("2020-12-03")],
        s.params,
      ),
    ).toBe("active");
    expect(segment({ ...old, pre_complete: false }, [], s.params)).toBe(
      "unknown",
    );
    expect(
      segment({ ...a, registration: "2021-02-01T00:00:00Z" }, [], s.params),
    ).toBe("unknown");
  });
  it("respecte inclusions et filtres sans modifier les révisions", () => {
    const s = fixture();
    s.edits = [
      edit("2021-01-03"),
      edit("2021-01-04", "commonswiki", "Alice", "MEDIA"),
    ];
    expect(aggregate(s).totalEdits).toBe(2);
    s.params.categories = ["MEDIA"];
    expect(aggregate(s).totalEdits).toBe(1);
    s.cohort[0].included = false;
    expect(aggregate(s).totalEdits).toBe(0);
    expect(s.edits).toHaveLength(2);
  });
});
describe("temps et couverture", () => {
  it.each(HORIZONS)("les bornes de %i jours sont inclusives", (h) => {
    const s = fixture();
    const day = new Date(Date.parse(s.params.end) + h * 86400000)
      .toISOString()
      .slice(0, 10);
    const m = temporal([edit(day)], s.params);
    expect(m[HORIZONS.indexOf(h)].period).toBe(true);
    expect(m[HORIZONS.indexOf(h)].cumulative).toBe(true);
  });
  it("une édition à J+3 ne signifie pas activité à un an", () => {
    const s = fixture();
    const m = temporal([edit("2021-01-05")], s.params);
    expect(m[3].cumulative).toBe(true);
    expect(m[3].period).toBe(false);
  });
  it("écarte le jour de fin et les données futures", () => {
    const s = fixture();
    s.edits = [edit("2021-01-02"), edit("2027-01-01")];
    expect(aggregate(s).totalEdits).toBe(0);
  });
  it("une période non échue ne donne pas de taux", () => {
    const s = fixture();
    s.params.reference = "2021-05-01";
    s.collection_signature = signature(s.params);
    expect(aggregate(s).periods[3].rate).toBeNull();
    expect(aggregate(s).periods[3].available).toBe(false);
  });
  it("un utilisateur en échec ne devient pas inactif certain", () => {
    const s = fixture();
    s.cohort[1].post_complete = false;
    s.cohort[1].technical = "failed";
    expect(aggregate(s).periods[0].rate).toBeNull();
    expect(aggregate(s).migration.unknown).toBe(1);
  });
  it("un changement de périmètre invalide la couverture", () => {
    const s = fixture();
    s.params.pre_days = 365;
    expect(aggregate(s).complete).toBe(false);
  });
});
describe("migration, taxonomie et PDF", () => {
  it.each([
    ["origin", ["frwiki"]],
    ["other", ["commonswiki"]],
    ["both", ["frwiki", "commonswiki"]],
    ["none", []],
  ])("classe le parcours %s", (kind, projects) => {
    const s = fixture();
    s.edits = (projects as string[]).map((p, i) =>
      edit("2021-01-0" + (i + 3), p),
    );
    expect(aggregate(s).rows[0].migration).toBe(kind);
  });
  it("utilise les noms canoniques et pas des IDs globaux de namespace", () => {
    const s = fixture();
    s.catalog = [
      {
        id: "commonswiki",
        domain: "commons.wikimedia.org",
        label: "Commons",
        family: "commons",
      },
    ];
    s.namespaces = {
      commonswiki: { "73": { id: 73, canonical: "File", name: "Fichier" } },
    };
    s.taxonomy = {
      version: "1",
      community_suffix: "talk",
      maintenance: ["Category"],
      families: {},
      projects: { commonswiki: { File: "MEDIA" } },
      default: "OTHER",
    };
    expect(classify(s, "commonswiki", 73)).toBe("MEDIA");
    expect(classify(s, "commonswiki", 0)).toBe("OTHER");
  });
  it("génère un rapport vectoriel multipage non nominatif par défaut", () => {
    const s = fixture();
    s.edits = [edit("2021-01-03")];
    const pdf = makePDF(s);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    const text = pdf.output();
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).not.toContain("(Alice)");
    expect(makePDF(s, true).output()).toContain("Alice");
  });
});
export { fixture, edit };

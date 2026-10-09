import { describe, expect, it } from "vitest";
import { cohortFilename, cohortRows, parseCohortCSV } from "./cohortFiles";
import { csvText } from "./exports";
import { importNames } from "./imports";
import { registrationImport } from "./registrationImporter";

function data() {
  const s = registrationImport("2026-01-01", "2026-01-30");
  s.accounts = importNames("RegisteredAccount\n=SpecialName").accounts.map(
    (a, i) => ({
      ...a,
      registration: "2026-01-02T10:00:00Z",
      signup: {
        timestamp: "2026-01-02T10:00:00Z",
        local_id: i + 1,
        original_name: a.username,
      },
    }),
  );
  s.complete = true;
  s.unavailable = 2;
  s.accounts[1].included = false;
  return s;
}
describe("saved registration cohorts", () => {
  it("names a single day and a range explicitly", () => {
    expect(cohortFilename("2026-01-13", "2026-01-13", "txt")).toBe(
      "nouveaux-comptes-frwiki_2026-01-13.txt",
    );
    expect(cohortFilename("2026-01-01", "2026-01-30", "csv")).toBe(
      "nouveaux-comptes-frwiki_2026-01-01_2026-01-30.csv",
    );
  });
  it("restores the original membership, dates, excluded accounts and incomplete source coverage", () => {
    const saved = data(),
      restored = parseCohortCSV(csvText(cohortRows(saved)))!;
    expect([restored.start, restored.end, restored.unavailable]).toEqual([
      saved.start,
      saved.end,
      2,
    ]);
    expect(
      restored.accounts.map((a) => [
        a.username,
        a.registration,
        a.included,
        a.signup?.local_id,
      ]),
    ).toEqual(
      saved.accounts.map((a) => [
        a.username,
        a.registration,
        a.included,
        a.signup?.local_id,
      ]),
    );
    expect(restored.accounts.every((a) => !a.qualified)).toBe(true);
  });
  it("rejects inconsistent dates and duplicate identities, but leaves ordinary username CSV imports alone", () => {
    const rows = cohortRows(data());
    rows[1].cohort_start = "2026-01-02";
    expect(() => parseCohortCSV(csvText(rows))).toThrow();
    expect(() => parseCohortCSV(csvText([rows[0], rows[0]]))).toThrow();
    expect(
      parseCohortCSV("username;project\nRegisteredAccount;frwiki"),
    ).toBeNull();
  });
});

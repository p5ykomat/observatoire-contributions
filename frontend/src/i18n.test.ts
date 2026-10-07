import { afterEach, expect, it } from "vitest";
import i18n, { translateMessage } from "./i18n";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import { emptySession } from "./types";
import { makePDF } from "./exports";

function leaves(value: unknown, path = ""): Record<string, string> {
  if (typeof value === "string") return { [path]: value };
  return Object.fromEntries(
    Object.entries(value as object).flatMap(([key, child]) =>
      Object.entries(leaves(child, `${path}.${key}`)),
    ),
  );
}
afterEach(async () => {
  await i18n.changeLanguage("fr");
});
it("les deux langues couvrent les mêmes champs et variables", () => {
  const french = leaves(fr),
    english = leaves(en);
  expect(Object.keys(english).sort()).toEqual(Object.keys(french).sort());
  for (const [key, text] of Object.entries(french)) {
    expect(english[key].match(/\{\{\w+\}\}/g)?.sort() ?? []).toEqual(
      text.match(/\{\{\w+\}\}/g)?.sort() ?? [],
    );
  }
  expect(typeof fr.privacy).toBe("string");
});
it("les messages d’une archive se traduisent sans modifier les noms ou notes libres", async () => {
  await i18n.changeLanguage("en");
  expect(translateMessage("Vérification indisponible")).toBe(
    "Verification unavailable",
  );
  expect(translateMessage("Doublon : Alice")).toBe("Duplicate: Alice");
  expect(translateMessage("Note personnelle non traduite")).toBe(
    "Note personnelle non traduite",
  );
  expect(
    translateMessage(
      "La vérification reste incomplète pour 1 compte non exclu. Réessayez avec « Vérifier les comptes et continuer ». Aucune contribution n’a encore été collectée.",
    ),
  ).toContain("1 account that is not excluded");
});
it("le rapport PDF est également disponible en anglais", async () => {
  await i18n.changeLanguage("en");
  const session = emptySession();
  session.params.start = session.params.end = "2026-04-03";
  const pdf = makePDF(session).output();
  expect(pdf).toContain("Wikimedia Retention");
  expect(pdf).toContain("Methodology version 1.0");
  expect(pdf).toContain("Collection is incomplete");
  expect(pdf).not.toContain("Groupe initial");
});

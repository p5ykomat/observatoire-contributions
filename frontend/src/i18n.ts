import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

function savedLanguage() {
  if (typeof window === "undefined") return "fr";
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested === "en" || requested === "fr") return requested;
  try {
    return window.localStorage.getItem("retention-language") === "en"
      ? "en"
      : "fr";
  } catch {
    return "fr";
  }
}

function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = i18n.resolvedLanguage ?? "fr";
  document.title = i18n.t("app");
  try {
    window.localStorage.setItem(
      "retention-language",
      i18n.resolvedLanguage ?? "fr",
    );
  } catch {
    /* The interface works when browser storage is unavailable. */
  }
}
i18n.on("languageChanged", updateDocument);
void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: savedLanguage(),
  supportedLngs: ["fr", "en"],
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});
updateDocument();

// Translate generated messages in restored archives without changing stored data.
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    strings(child, path ? `${path}.${key}` : key),
  );
}
const messages = [...strings(fr), ...strings(en)].map(([key, template]) => {
  const names: string[] = [];
  const pattern = template
    .split(/(\{\{\w+\}\})/)
    .map((part) => {
      if (part.startsWith("{{")) {
        names.push(part.slice(2, -2));
        return "(.+?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { key, names, pattern: new RegExp(`^${pattern}$`, "s") };
});
export function translateMessage(message: string) {
  if (!message) return message;
  for (const { key, names, pattern } of messages) {
    const match = message.match(pattern);
    if (!match) continue;
    const values = Object.fromEntries(
      names.map((name, index) => [
        name,
        name === "count" ? Number(match[index + 1]) : match[index + 1],
      ]),
    );
    return String(i18n.t(key, values));
  }
  return message;
}
export function isMessage(message: string, key: string) {
  return messages.some(
    (entry) => entry.key === key && entry.pattern.test(message),
  );
}
export default i18n;

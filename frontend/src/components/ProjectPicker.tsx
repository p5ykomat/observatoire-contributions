import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Project } from "../types";

const languageFamilies = new Set([
  "wikipedia",
  "wiktionary",
  "wikisource",
  "wikibooks",
  "wikiquote",
  "wikinews",
  "wikiversity",
  "wikivoyage",
]);

export function ProjectPicker({
  title,
  catalog,
  selected,
  change,
  retry,
}: {
  title: "origins" | "projects";
  catalog: Project[];
  selected: string[];
  change: (ids: string[]) => void;
  retry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const languageNames = useMemo(
    () =>
      new Intl.DisplayNames([i18n.resolvedLanguage ?? "fr"], {
        type: "language",
      }),
    [i18n.resolvedLanguage],
  );
  const familyName = (family: string) =>
    t("fup.families." + family, { defaultValue: family });
  const projectName = (project: Project) => {
    if (!languageFamilies.has(project.family)) return project.domain;
    const code = project.domain.split(".")[0];
    try {
      const name = languageNames.of(code);
      return `${name ?? code} (${code})`;
    } catch {
      return code;
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const families = [...new Set(catalog.map((project) => project.family))].sort(
    (a, b) => {
      const priority = ["wikipedia", "commons", "wikidata"];
      const rank = (family: string) =>
        priority.includes(family) ? priority.indexOf(family) : priority.length;
      return rank(a) - rank(b) || familyName(a).localeCompare(familyName(b));
    },
  );
  return (
    <fieldset className="project-picker">
      <legend>{t(title)}</legend>
      <p className="hint">{t("projectPickerHelp")}</p>
      <p role="status">
        {t("projectSelectionCount", { count: selected.length })}
      </p>
      <label>
        {t("projectSearch")}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {families.map((family) => {
        const all = catalog.filter((project) => project.family === family);
        const visible = all.filter((project) =>
          [
            project.domain,
            project.id,
            projectName(project),
            familyName(family),
          ].some((value) => value.toLocaleLowerCase().includes(query)),
        );
        if (!visible.length) return null;
        return (
          <details
            key={family}
            open={query ? true : undefined}
            className="project-family"
          >
            <summary>
              {familyName(family)}{" "}
              <span className="hint">
                (
                {t("projectFamilyCount", {
                  selected: all.filter((project) =>
                    selected.includes(project.id),
                  ).length,
                  total: all.length,
                })}
                )
              </span>
            </summary>
            {all.length > 1 && (
              <div className="actions">
                <button
                  type="button"
                  onClick={() =>
                    change([
                      ...new Set([
                        ...selected,
                        ...all.map((project) => project.id),
                      ]),
                    ])
                  }
                >
                  {t("selectProjectFamily", { family: familyName(family) })}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    change(
                      selected.filter(
                        (id) => !all.some((project) => project.id === id),
                      ),
                    )
                  }
                >
                  {t("clearProjectFamily", { family: familyName(family) })}
                </button>
              </div>
            )}
            <div className="project-list">
              {visible.map((project) => (
                <label key={project.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(project.id)}
                    onChange={() =>
                      change(
                        selected.includes(project.id)
                          ? selected.filter((id) => id !== project.id)
                          : [...selected, project.id],
                      )
                    }
                  />
                  <span>
                    {projectName(project)}
                    {languageFamilies.has(project.family) && (
                      <small className="project-domain">{project.domain}</small>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
      {catalog.length > 0 &&
        !catalog.some((project) =>
          [
            project.domain,
            project.id,
            projectName(project),
            familyName(project.family),
          ].some((value) => value.toLocaleLowerCase().includes(query)),
        ) && <p>{t("noProjectsFound")}</p>}
      {!catalog.length && (
        <>
          <input
            aria-label={t(title)}
            value={selected.join(", ")}
            onChange={(event) =>
              change(
                event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
          />
          <button onClick={retry}>{t("retry")}</button>
        </>
      )}
    </fieldset>
  );
}

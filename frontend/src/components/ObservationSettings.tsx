import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CATEGORIES,
  today,
  type FollowupQuestion,
  type Params,
  type Session,
} from "../types";
import { PRESET_PROJECTS } from "../registrationImporter";
import { ProjectPicker } from "./ProjectPicker";

export function ObservationSettings({
  session,
  change,
  question,
}: {
  session: Session;
  change: (p: Partial<Params>) => void;
  question: (q: FollowupQuestion) => void;
}) {
  const { t } = useTranslation();
  const p = session.params,
    o = p.observation!,
    q = session.question!;
  const [scope, setScope] = useState(
    p.scope === "all"
      ? "all"
      : p.projects.every((id) => PRESET_PROJECTS.includes(id))
        ? "preset"
        : "custom",
  );
  const updateObservation = (patch: Partial<typeof o>) =>
    change({ observation: { ...o, ...patch }, reference: patch.end ?? o.end });
  function projects(ids: string[]) {
    change({ scope: "custom", projects: [...new Set(ids)] });
    question({
      ...q,
      projects: [...new Set(ids)],
      families: ["*"],
      wikipedia_languages: ["*"],
    });
  }
  return (
    <>
      <fieldset>
        <legend>{t("newAccounts.observation")}</legend>
        <p className="hint">{t("newAccounts.observationHelp")}</p>
        <div className="checks">
          {(["registration", "period"] as const).map((mode) => (
            <label className="check" key={mode}>
              <input
                type="radio"
                name="observation-mode"
                checked={o.mode === mode}
                onChange={() => updateObservation({ mode })}
              />
              {t("newAccounts.mode." + mode)}
            </label>
          ))}
        </div>
        <p className="hint">{t("newAccounts.modeHelp." + o.mode)}</p>
        <div className="form-grid">
          {o.mode === "period" && (
            <label>
              {t("newAccounts.observedFrom")}
              <input
                type="date"
                min={session.new_accounts!.start}
                max={o.end}
                value={o.start}
                onChange={(e) => updateObservation({ start: e.target.value })}
              />
            </label>
          )}
          <label>
            {t("newAccounts.observedTo")}
            <input
              type="date"
              min={o.mode === "period" ? o.start : session.new_accounts!.end}
              max={today()}
              value={o.end}
              onChange={(e) => updateObservation({ end: e.target.value })}
            />
          </label>
        </div>
        <button onClick={() => updateObservation({ end: today() })}>
          {t("fup.today")}
        </button>
      </fieldset>
      <fieldset>
        <legend>{t("newAccounts.projects")}</legend>
        <div className="checks">
          {["preset", "all", "custom"].map((mode) => (
            <label className="check" key={mode}>
              <input
                type="radio"
                name="observation-scope"
                checked={scope === mode}
                onChange={() => {
                  setScope(mode);
                  if (mode === "all") {
                    change({ scope: "all", projects: [] });
                    question({
                      ...q,
                      projects: undefined,
                      families: ["*"],
                      wikipedia_languages: ["*"],
                    });
                  } else projects(mode === "preset" ? PRESET_PROJECTS : []);
                }}
              />
              {t("newAccounts.scope." + mode)}
            </label>
          ))}
        </div>
        {scope === "preset" && (
          <div className="checks preset-projects">
            {PRESET_PROJECTS.map((id) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={p.projects.includes(id)}
                  onChange={() =>
                    projects(
                      p.projects.includes(id)
                        ? p.projects.filter((i) => i !== id)
                        : [...p.projects, id],
                    )
                  }
                />
                {t("newAccounts.presets." + id)}
              </label>
            ))}
          </div>
        )}
        {scope === "all" && (
          <p className="notice">
            {t("newAccounts.allProjects", { count: session.catalog.length })}
          </p>
        )}
        {scope === "custom" && (
          <ProjectPicker
            title="projects"
            catalog={session.catalog}
            selected={p.projects}
            change={projects}
            retry={() => {}}
          />
        )}
      </fieldset>
      {(p.scope === "all" ||
        p.projects.some(
          (id) =>
            session.catalog.find((w) => w.id === id)?.family === "wikipedia",
        )) && (
        <fieldset>
          <legend>{t("fup.wikipediaCategories")}</legend>
          <p className="hint">{t("fup.otherCategories")}</p>
          <div className="checks">
            {CATEGORIES.filter(
              (c) => !["MEDIA", "STRUCTURED_DATA"].includes(c),
            ).map((c) => (
              <label className="check" key={c}>
                <input
                  type="checkbox"
                  checked={q.wikipedia_categories.includes(c)}
                  onChange={() =>
                    question({
                      ...q,
                      wikipedia_categories: q.wikipedia_categories.includes(c)
                        ? q.wikipedia_categories.filter((v) => v !== c)
                        : [...q.wikipedia_categories, c],
                    })
                  }
                />
                <span>
                  {t("category." + c)}
                  <small className="category-example">
                    {t("newAccounts.wikipediaExamples." + c)}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

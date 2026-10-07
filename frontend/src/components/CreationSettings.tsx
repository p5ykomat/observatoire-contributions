import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Params } from "../types";
import { dateMs, DAY } from "../analysis/cohorts";

export function CreationSettings({
  params: p,
  change,
}: {
  params: Params;
  change: (patch: Partial<Params>) => void;
}) {
  const { t } = useTranslation();
  const presets = [
    { before: 0, after: 0 },
    { before: 7, after: 1 },
    { before: 14, after: 1 },
    { before: 30, after: 1 },
  ];
  const initial = presets.findIndex(
    (v) => v.before === p.creation_before && v.after === p.creation_after,
  );
  const [preset, setPreset] = useState(
    initial < 0 ? "custom" : String(initial),
  );
  return (
    <fieldset className="participant-settings">
      <legend>{t("selection")}</legend>
      <label>
        {t("selection")}
        <select
          aria-label={t("selection")}
          value={p.selection === "new" ? "new" : "all"}
          onChange={(e) =>
            change({
              selection: e.target.value as "all" | "new",
              creation_restriction: false,
            })
          }
        >
          <option value="all">{t("selections.all")}</option>
          <option value="new">{t("selections.new")}</option>
        </select>
      </label>
      <p className="hint">
        {t(p.selection === "new" ? "newSelectionHelp" : "allSelectionHelp")}
      </p>
      {p.selection === "new" && (
        <div className="creation-settings">
          <h2>{t("creation")}</h2>
          <label>
            {t("preset")}
            <select
              aria-label={t("preset")}
              value={preset}
              aria-describedby="creation-help"
              onChange={(e) => {
                const value = e.target.value;
                setPreset(value);
                if (value !== "custom") {
                  const window = presets[Number(value)];
                  change({
                    creation_before: window.before,
                    creation_after: window.after,
                  });
                }
              }}
            >
              {(t("presets", { returnObjects: true }) as string[])
                .slice(0, 4)
                .map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              <option value="custom">{t("custom")}</option>
            </select>
          </label>
          <p id="creation-help" className="hint">
            {t("creationHelp")}
          </p>
          {preset === "custom" && (
            <div className="settings-grid">
              <label>
                {t("before")}
                <input
                  type="number"
                  min="0"
                  max="36500"
                  value={p.creation_before}
                  onChange={(e) =>
                    change({ creation_before: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {t("after")}
                <input
                  type="number"
                  min="0"
                  max="36500"
                  value={p.creation_after}
                  onChange={(e) =>
                    change({ creation_after: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
          <p className="hint">
            {t("creationSummary", {
              before: p.creation_before,
              after: p.creation_after,
            })}
          </p>
          {p.start && (
            <p className="notice">
              {t("creationDates", {
                start: new Date(dateMs(p.start) - p.creation_before * DAY)
                  .toISOString()
                  .slice(0, 10),
                end: new Date(dateMs(p.start) + p.creation_after * DAY)
                  .toISOString()
                  .slice(0, 10),
              })}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { today, type Params } from "../types";
import { creationWindow } from "../analysis/cohorts";

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
    { before: 7, after: 0 },
    { before: 14, after: 0 },
    { before: 30, after: 0 },
  ];
  const initial = presets.findIndex(
    (v) => v.before === p.creation_before && v.after === p.creation_after,
  );
  const [preset, setPreset] = useState(
    p.creation_range || initial < 0 ? "custom" : String(initial),
  );
  const window = creationWindow(p);
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
                    creation_range: undefined,
                  });
                } else {
                  change({ creation_range: window });
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
                {t("creationRangeStart")}
                <input
                  type="date"
                  max={today()}
                  value={window.start}
                  onChange={(event) =>
                    change({
                      creation_range: { ...window, start: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                {t("creationRangeEnd")}
                <input
                  type="date"
                  max={today()}
                  value={window.end}
                  onChange={(event) =>
                    change({
                      creation_range: { ...window, end: event.target.value },
                    })
                  }
                />
              </label>
            </div>
          )}
          {window.start && window.end && window.start <= window.end ? (
            <p className="notice">{t("creationDates", window)}</p>
          ) : (
            <p className="hint">{t("invalidCreationRange")}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}

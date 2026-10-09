import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EARLIEST_REGISTRATION,
  loadRegistrations,
  registrationImport,
  type RegistrationImport,
} from "../registrationImporter";
import { today } from "../types";

export function NewAccountsImport({
  onImport,
}: {
  onImport: (data: RegistrationImport) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("day");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [state, setState] = useState<RegistrationImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    const last = mode === "day" ? start : end;
    if (
      !start ||
      !last ||
      start > last ||
      start < EARLIEST_REGISTRATION ||
      last > today()
    ) {
      setError(t("newAccounts.invalidDates"));
      return;
    }
    const next =
      state?.start === start && state.end === last && !state.complete
        ? structuredClone(state)
        : registrationImport(start, last);
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    try {
      await loadRegistrations(next, setState, controller.current.signal);
    } catch {
      if (!controller.current.signal.aborted) setError(t("newAccounts.failed"));
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || Boolean(state);
  return (
    <section
      className="panel new-accounts-import"
      aria-labelledby="new-accounts-title"
    >
      <p className="eyebrow">{t("newAccounts.source")}</p>
      <h2 id="new-accounts-title">{t("newAccounts.title")}</h2>
      <p>{t("newAccounts.intro")}</p>
      <details>
        <summary>{t("newAccounts.open")}</summary>
        <fieldset>
          <legend>{t("newAccounts.creationDates")}</legend>
          <div className="checks">
            {["day", "range"].map((value) => (
              <label className="check" key={value}>
                <input
                  type="radio"
                  name="registration-dates"
                  disabled={locked}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {t("newAccounts." + value)}
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label>
              {t(
                mode === "day"
                  ? "newAccounts.createdOn"
                  : "newAccounts.createdFrom",
              )}
              <input
                type="date"
                min={EARLIEST_REGISTRATION}
                max={today()}
                value={start}
                disabled={locked}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            {mode === "range" && (
              <label>
                {t("newAccounts.createdTo")}
                <input
                  type="date"
                  min={start || EARLIEST_REGISTRATION}
                  max={today()}
                  value={end}
                  disabled={locked}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            )}
          </div>
          <p className="hint">{t("newAccounts.history")}</p>
          <p className="hint">{t("newAccounts.exclusions")}</p>
        </fieldset>
        <div role="status">
          {state &&
            t(state.complete ? "newAccounts.loaded" : "newAccounts.loading", {
              count: state.accounts.length,
            })}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {state?.unavailable ? (
          <p className="notice">
            {t("newAccounts.unavailable", { count: state.unavailable })}
          </p>
        ) : null}
        <div className="actions">
          {!state?.complete && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void load()}
            >
              {t(state ? "newAccounts.resume" : "newAccounts.load")}
            </button>
          )}
          {busy && (
            <button onClick={() => controller.current?.abort()}>
              {t("pause")}
            </button>
          )}
          {state && !busy && (
            <button
              onClick={() => {
                setState(null);
                setError("");
              }}
            >
              {t("newAccounts.changeDates")}
            </button>
          )}
          {state?.complete && state.accounts.length > 0 && (
            <>
              <button className="primary" onClick={() => onImport(state)}>
                {t("newAccounts.continue")}
              </button>
              <button
                onClick={() =>
                  void import("../exports").then(({ exportCohort }) =>
                    exportCohort(state, "csv"),
                  )
                }
              >
                {t("newAccounts.export")}
              </button>
              <button
                onClick={() =>
                  void import("../exports").then(({ exportCohort }) =>
                    exportCohort(state, "txt"),
                  )
                }
              >
                {t("newAccounts.exportTxt")}
              </button>
            </>
          )}
        </div>
        <p className="hint">{t("newAccounts.browser")}</p>
      </details>
    </section>
  );
}

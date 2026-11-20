import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  eventRegistrationImport,
  loadEventRegistration,
  type EventRegistrationImport as ImportState,
} from "../eventRegistrationImporter";

export function EventRegistrationImport({
  onImport,
}: {
  onImport: (data: ImportState) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ImportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (!url.trim()) {
      setError(t("eventRegistration.invalid"));
      return;
    }
    const next = state
      ? structuredClone(state)
      : eventRegistrationImport(url.trim());
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      await loadEventRegistration(next, setState, abort.signal);
    } catch {
      if (!abort.signal.aborted) setError(t("eventRegistration.failed"));
    } finally {
      if (!abort.signal.aborted || controller.current === abort) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="event-import-title">
      <h2 id="event-import-title">Event Registration</h2>
      <p>{t("eventRegistration.intro")}</p>
      <label htmlFor="event-registration-url">
        {t("eventRegistration.url")}
      </label>
      <input
        id="event-registration-url"
        type="url"
        value={url}
        disabled={busy || Boolean(state)}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? "event-import-error event-import-privacy"
            : "event-import-privacy"
        }
        placeholder="https://meta.wikimedia.org/wiki/Event:…"
        onChange={(event) => setUrl(event.target.value)}
      />
      <p id="event-import-privacy" className="hint">
        {t("eventRegistration.privacy")}
      </p>
      <p role="status">
        {state
          ? t(
              state.phase === "complete"
                ? "eventRegistration.loaded"
                : "eventRegistration.progress",
              {
                count: state.accounts.filter((a) =>
                  a.roles.includes("participant"),
                ).length,
                organizers: state.accounts.filter((a) => a.staff).length,
              },
            )
          : ""}
      </p>
      {state?.event && <p>{state.event.title}</p>}
      {state?.unavailable ? (
        <p className="notice">
          {t("eventRegistration.unavailable", { count: state.unavailable })}
        </p>
      ) : null}
      {error && (
        <p id="event-import-error" className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {state?.phase !== "complete" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void load()}
          >
            {t(state ? "eventRegistration.resume" : "eventRegistration.load")}
          </button>
        )}
        {busy && (
          <button onClick={() => controller.current?.abort()}>
            {t("pause")}
          </button>
        )}
        {state?.phase === "complete" && (
          <button
            className="primary"
            disabled={!state.accounts.length}
            onClick={() => onImport(state)}
          >
            {t("eventRegistration.use")}
          </button>
        )}
        {state && !busy && (
          <button
            onClick={() => {
              setState(null);
              setError("");
            }}
          >
            {t("eventRegistration.change")}
          </button>
        )}
      </div>
    </section>
  );
}

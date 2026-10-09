import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, retry } from "./api";
import { isMessage, translateMessage } from "./i18n";
import { Collector } from "./collector";
import {
  importArchive,
  importNames,
  normalize,
  parseCSV,
  readFile,
} from "./imports";
import {
  emptySession,
  today,
  type Account,
  type Params,
  type Project,
  type Session,
} from "./types";
const Results = lazy(() =>
  import("./components/Results").then((m) => ({ default: m.Results })),
);
import { FileInput } from "./components/FileInput";
import { aggregate } from "./analysis/aggregation";
import { creationWindow, dateMs, signature } from "./analysis/cohorts";
import { CreationSettings } from "./components/CreationSettings";
import { QualificationTable } from "./components/QualificationTable";
import { ProjectPicker } from "./components/ProjectPicker";
import { SelectionReview } from "./components/SelectionReview";
import { NewAccountsImport } from "./components/NewAccountsImport";
import { ObservationSettings } from "./components/ObservationSettings";
import {
  PRESET_PROJECTS,
  type RegistrationImport,
} from "./registrationImporter";
import { defaultQuestion } from "./types";
import { parseCohortCSV, cohortFileDates } from "./cohortFiles";
interface Dashboard {
  title: string;
  start: string | null;
  end: string | null;
  home_wiki: { language: string; project: string } | null;
  participants: Partial<Account>[];
}
export default function App() {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<Session>(emptySession),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [names, setNames] = useState(""),
    [url, setUrl] = useState(""),
    [csv, setCSV] = useState<string[][]>([]),
    [column, setColumn] = useState(0),
    [exclusions, setExclusions] = useState(""),
    [dashboardDates, setDashboardDates] = useState<{
      start: string;
      end: string;
    } | null>(null),
    [dateChoice, setDateChoice] = useState<"" | "provided" | "custom">(""),
    [paused, setPaused] = useState(false);
  const collector = useRef<Collector | null>(null);
  const generation = useRef(0);
  const customScopeInitialized = useRef(false);
  const importRequest = useRef<AbortController | null>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const resetCancelButton = useRef<HTMLButtonElement>(null);
  const [csvHeader, setCsvHeader] = useState(true);
  const update = (patch: Partial<Session>) =>
    setS((previous) => ({ ...previous, ...patch }));
  const params = (patch: Partial<Params>) =>
    setS((previous) => ({
      ...previous,
      params: { ...previous.params, ...patch },
    }));
  async function perform(fn: () => Promise<void>) {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : t("errors.network"));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function importText(
    text: string,
    cohortDates?: { start: string; end: string },
  ) {
    try {
      const data = importNames(text, cohortDates ? 100000 : 1000);
      if (!data.accounts.length) throw new Error(t("errors.names"));
      setS((previous) => ({
        ...emptySession(),
        catalog: previous.catalog,
        params: { ...previous.params, observation: undefined },
        cohort: data.accounts,
        diagnostics: data.diagnostics,
        stage: 1,
      }));
      setPendingExclusions({});
      setExclusions("");
      setNames("");
      setCSV([]);
      setError("");
      setNotice("");
      setDashboardDates(null);
      setDateChoice("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function importRegistrations(data: RegistrationImport) {
    const base = emptySession();
    setDashboardDates(null);
    setDateChoice("");
    setPendingExclusions({});
    setExclusions("");
    customScopeInitialized.current = true;
    setS({
      ...base,
      catalog: s.catalog,
      cohort: data.accounts,
      stage: 1,
      new_accounts: {
        start: data.start,
        end: data.end,
        unavailable: data.unavailable,
        excluded: data.excluded,
      },
      params: {
        ...base.params,
        title: t("newAccounts.analysisTitle"),
        start: data.start,
        end: data.end,
        scope: "custom",
        projects: [...PRESET_PROJECTS],
        selection: "all",
        pre_days: 1,
        observation: { mode: "registration", start: data.start, end: today() },
      },
      question: {
        ...defaultQuestion(),
        days: "today",
        families: ["*"],
        wikipedia_languages: ["*"],
        projects: [...PRESET_PROJECTS],
      },
    });
  }
  function validateDates() {
    const p = s.params;
    const window = creationWindow(p);
    if (p.observation) {
      const o = p.observation;
      if (
        !o.end ||
        o.end > today() ||
        (o.mode === "period" && (!o.start || o.start > o.end)) ||
        (o.mode === "registration" && o.end < s.new_accounts!.end) ||
        (p.scope === "custom" && !p.projects.length)
      )
        throw new Error(t("errors.dates"));
    }
    if (
      !p.start ||
      !p.end ||
      p.start > p.end ||
      p.end > today() ||
      p.pre_days < 1 ||
      p.pre_threshold < 0 ||
      p.creation_before < 0 ||
      p.creation_after < 0 ||
      !p.origins.length ||
      (p.scope === "custom" && !p.projects.length)
    )
      throw new Error(t("errors.dates"));
    if (
      p.selection === "new" &&
      (!Number.isFinite(dateMs(window.start)) ||
        !Number.isFinite(dateMs(window.end)) ||
        window.start > window.end ||
        window.end > today())
    )
      throw new Error(t("invalidCreationRange"));
  }
  async function qualify() {
    const current = generation.current;
    const engine = new Collector(structuredClone(s), (session) => {
      if (current === generation.current) setS(session);
    });
    collector.current = engine;
    await engine.qualify();
    if (engine.stopped) return;
    const unavailable = engine.session.cohort.filter(
      (a) => a.included && !a.qualified,
    ).length;
    if (unavailable) {
      engine.session.stage = 1;
      engine.emit();
      if (current === generation.current)
        setError(t("verificationIncomplete", { count: unavailable }));
      return;
    }
    engine.session.stage = 2;
    try {
      await engine.metadata();
    } catch {
      engine.session.diagnostics.push(t("errors.network"));
    }
    engine.emit();
    if (current === generation.current)
      setNotice(
        t("verificationSummary", {
          verified: engine.session.cohort.filter((a) => a.qualified).length,
          excluded: engine.session.cohort.filter((a) => !a.included).length,
        }),
      );
  }
  async function launch(recollect = false) {
    if (dashboardDates && !dateChoice) throw new Error(t("confirmEventDates"));
    validateDates();
    if (!aggregate(s).n) throw new Error(t("zeroSelection"));
    const session = structuredClone(s);
    session.stage = 3;
    session.params.reference = session.params.observation?.end ?? today();
    const current = generation.current;
    const engine = new Collector(session, (value) => {
      if (current === generation.current) setS(value);
    });
    collector.current = engine;
    setPaused(false);
    engine.emit();
    await engine.prepare(recollect);
    await engine.run();
  }
  const [pendingExclusions, setPendingExclusions] = useState<
    Record<string, boolean>
  >({});
  const typedExclusions = new Set(
    exclusions.split(/\r?\n/).map(normalize).filter(Boolean),
  );
  const hasPendingExclusions = s.cohort.some(
    (a) =>
      (typedExclusions.has(a.username)
        ? true
        : (pendingExclusions[a.username] ?? !a.included)) !== !a.included,
  );
  function applyExclusions() {
    update({
      cohort: s.cohort.map((a) => {
        const excluded =
          typedExclusions.has(a.username) ||
          (pendingExclusions[a.username] ?? !a.included);
        return {
          ...a,
          included: !excluded,
          exclusion_reason: excluded ? a.exclusion_reason || t("excluded") : "",
        };
      }),
    });
    setPendingExclusions({});
    setExclusions("");
  }
  function toggle(name: string) {
    setS((previous) => ({
      ...previous,
      cohort: previous.cohort.map((a) =>
        a.username === name
          ? {
              ...a,
              included: !a.included,
              exclusion_reason: a.included ? t("excluded") : "",
            }
          : a,
      ),
    }));
  }
  async function dashboard() {
    setPendingExclusions({});
    setExclusions("");
    const current = generation.current;
    const controller = new AbortController();
    importRequest.current = controller;
    const data = await retry(
      () => api<Dashboard>("dashboard", { url }, controller.signal),
      () => {
        if (current === generation.current) setNotice(t("technical.retrying"));
      },
      controller.signal,
    );
    if (current !== generation.current) return;
    customScopeInitialized.current = false;
    const imported = importNames(
      data.participants.map((a) => a.username).join("\n"),
    );
    const accounts = imported.accounts.map((a) => ({
      ...a,
      ...data.participants.find((p) => p.username === a.username),
      exclusion_reason: data.participants.find((p) => p.username === a.username)
        ?.staff
        ? t("staff")
        : "",
    }));
    const home = data.home_wiki;
    setDashboardDates({
      start: data.start?.slice(0, 10) ?? "",
      end: data.end?.slice(0, 10) ?? "",
    });
    setNotice("");
    setDateChoice("");
    const origin = home
      ? home.project === "wikidata"
        ? "wikidatawiki"
        : home.project === "commons"
          ? "commonswiki"
          : home.language +
            (home.project === "wikipedia" ? "wiki" : home.project)
      : "frwiki";
    setS({
      ...emptySession(),
      params: {
        ...s.params,
        title: data.title,
        observation: undefined,
        start: "",
        end: "",
        origins: [origin],
        projects: [],
      },
      cohort: accounts,
      diagnostics: imported.diagnostics,
      stage: 1,
    });
  }
  async function loadFile(file: File) {
    const current = generation.current;
    const text = await readFile(file);
    if (current !== generation.current) return;
    if (file.name.toLowerCase().endsWith(".csv")) {
      let cohort: RegistrationImport | null;
      try {
        cohort = parseCohortCSV(text);
      } catch {
        throw new Error(t("newAccounts.invalidFile"));
      }
      if (cohort) {
        // A saved cohort never rereads the creation log. Local IDs resolve
        // names that have changed since export, before global verification.
        const controller = new AbortController();
        importRequest.current = controller;
        for (let offset = 0; offset < cohort.accounts.length; offset += 50) {
          const group = cohort.accounts.slice(offset, offset + 50);
          const verified = await retry(
            () =>
              api<{ accounts: Partial<Account>[]; excluded: number }>(
                "new-accounts/verify",
                {
                  candidates: group.map((a) => ({
                    local_id: a.signup!.local_id,
                    name: a.username,
                    timestamp: a.signup!.timestamp,
                  })),
                },
                controller.signal,
              ),
            () => {},
            controller.signal,
          );
          if (verified.excluded) throw new Error(t("newAccounts.invalidFile"));
          for (const a of group) {
            const remote = verified.accounts.find(
              (r) => r.signup?.local_id === a.signup!.local_id,
            );
            if (remote) {
              a.username = remote.username!;
              a.global_id = remote.global_id;
              a.bot = remote.bot ?? false;
            }
          }
          if (current !== generation.current) return;
        }
        importRegistrations(cohort);
        return;
      }
      setCSV(parseCSV(text));
      setColumn(0);
    } else if (file.name.toLowerCase().endsWith(".txt")) {
      const dates = cohortFileDates(file.name);
      importText(text, dates ?? undefined);
      if (dates) {
        params({ title: t("newAccounts.cohortDates", dates) });
        setNotice(t("newAccounts.txtImported", dates));
      }
    } else throw new Error(t("errors.file"));
  }
  function resetAnalysis() {
    generation.current++;
    importRequest.current?.abort();
    collector.current?.stop();
    collector.current = null;
    setPendingExclusions({});
    setS(emptySession());
    setNames("");
    setUrl("");
    setCSV([]);
    setColumn(0);
    setCsvHeader(true);
    setExclusions("");
    customScopeInitialized.current = false;
    setDashboardDates(null);
    setDateChoice("");
    setNotice("");
    setError("");
    setPaused(false);
    setBusy(false);
    resetDialog.current?.close();
  }
  function requestReset() {
    resetDialog.current?.showModal();
    resetCancelButton.current?.focus();
  }
  function projectPicker(key: "origins" | "projects") {
    const fixed = key === "origins" && dashboardDates !== null;
    return (
      <ProjectPicker
        title={key}
        catalog={
          fixed
            ? s.catalog.filter((project) =>
                s.params.origins.includes(project.id),
              )
            : s.catalog
        }
        selected={s.params[key]}
        readOnly={fixed}
        help={fixed ? "dashboardOriginProjectsHelp" : undefined}
        change={(ids) => {
          if (key === "projects") customScopeInitialized.current = true;
          params({ [key]: ids });
        }}
        retry={() =>
          void perform(async () =>
            update({ catalog: await api<Project[]>("projects") }),
          )
        }
      />
    );
  }
  const result = useMemo(() => aggregate(s), [s]),
    retainedAccounts = result.rows
      .filter((row) => row.included)
      .map((row) => row.account),
    processedAccounts = retainedAccounts.filter((a) =>
      ["completed_primary", "completed_fallback", "partial", "failed"].includes(
        a.technical,
      ),
    ).length,
    activeCollection = busy && s.stage === 3,
    changed =
      s.collection_signature !== null &&
      s.collection_signature !== signature(s.params);
  // Keep the persisted stage IDs compatible with existing JSON archives.
  const navigationStages = [0, 2, 3, 4];
  const steps = t("steps", { returnObjects: true }) as string[];
  const currentStep = s.stage === 1 ? 0 : navigationStages.indexOf(s.stage);
  const previousStep = Math.max(0, currentStep - 1);
  function navigate(stage: number) {
    if (stage === 0) update({ stage: s.cohort.length ? 1 : 0 });
    else if (stage === 2 && s.cohort.some((a) => a.included && !a.qualified))
      void perform(qualify);
    else update({ stage });
  }
  const eventDates = (
    <fieldset>
      <legend>{t("eventDatesTitle")}</legend>
      {dashboardDates && <p>{t("dashboardDateCheck", dashboardDates)}</p>}
      <p className="hint">{t("eventDatesHelp")}</p>
      {dashboardDates && (
        <div>
          <p>{t("dashboardDatesQuestion")}</p>
          <label className="check">
            <input
              type="radio"
              name="event-date-source"
              checked={dateChoice === "provided"}
              disabled={
                !dashboardDates.start ||
                !dashboardDates.end ||
                dashboardDates.end > today() ||
                dashboardDates.start > dashboardDates.end
              }
              onChange={() => {
                setDateChoice("provided");
                params(dashboardDates);
              }}
            />
            {t("useDashboardDates")}
          </label>
          <label className="check">
            <input
              type="radio"
              name="event-date-source"
              checked={dateChoice === "custom"}
              onChange={() => setDateChoice("custom")}
            />
            {t("customEventDates")}
          </label>
          {dashboardDates.end > today() && (
            <p className="hint">{t("futureDashboardDates")}</p>
          )}
        </div>
      )}
      <div className="form-grid">
        <label>
          {t("start")}
          <input
            type="date"
            value={s.params.start}
            max={today()}
            onChange={(e) => {
              params({ start: e.target.value });
              if (dashboardDates) setDateChoice("custom");
            }}
          />
        </label>
        <label>
          {t("end")}
          <input
            type="date"
            value={s.params.end}
            max={today()}
            onChange={(e) => {
              params({ end: e.target.value });
              if (dashboardDates) setDateChoice("custom");
            }}
          />
        </label>
      </div>
    </fieldset>
  );
  return (
    <div className="app theme-2">
      <a className="skip" href="#main">
        {t("skip")}
      </a>
      <header>
        <a className="brand" href="#main">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <span>{t("app")}</span>
        </a>
        <div className="header-actions">
          <label className="language-picker">
            {t("language")}
            <select
              aria-label={t("language")}
              value={i18n.resolvedLanguage === "en" ? "en" : "fr"}
              onChange={(event) => void i18n.changeLanguage(event.target.value)}
            >
              <option value="fr" lang="fr">
                Français
              </option>
              <option value="en" lang="en">
                English
              </option>
            </select>
          </label>
        </div>
      </header>
      <div className="workflow-bar">
        <nav aria-label={t("app")}>
          {steps.map((step, i) => (
            <button
              key={step}
              aria-current={
                s.stage === navigationStages[i] || (i === 0 && s.stage === 1)
                  ? "step"
                  : undefined
              }
              disabled={
                activeCollection ||
                busy ||
                (i > 0 && !s.cohort.length) ||
                ((i === 2 || i === 3) && !s.collection_signature)
              }
              onClick={() => navigate(navigationStages[i])}
            >
              <span>{i + 1}</span>
              {step}
            </button>
          ))}
        </nav>
        <div className="analysis-actions">
          <button
            className="back-action"
            disabled={currentStep < 1 || busy}
            aria-label={t("backToStep", { step: steps[previousStep] })}
            onClick={() => navigate(navigationStages[previousStep])}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m12 5-7 7 7 7M5 12h14" />
            </svg>
            {t("back")}
          </button>
          <button className="new-analysis-action" onClick={requestReset}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 10a9 9 0 1 1 1.5 7M3 4v6h6" />
            </svg>
            {t("newAnalysis")}
          </button>
        </div>
      </div>
      <main id="main">
        <div role="status" className={notice ? "notice" : ""}>
          {translateMessage(notice)}
        </div>
        {error && (
          <p role="alert" className="error">
            {translateMessage(error)}
          </p>
        )}
        {s.stage === 0 && (
          <>
            <section className="hero">
              <h1>{t("introText")}</h1>
            </section>
            <div className="import-grid">
              <section className="panel">
                <h2>{t("steps.0")}</h2>
                <label>
                  {t("names")}
                  <textarea
                    rows={9}
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    placeholder={t("exampleNames")}
                  />
                </label>
                <button className="primary" onClick={() => importText(names)}>
                  {t("import")}
                </button>
                <FileInput
                  label={t("file")}
                  accept=".txt,.csv"
                  onSelect={(file) => void perform(() => loadFile(file))}
                />
              </section>
              <section className="panel">
                <h2>Programs & Events Dashboard</h2>
                <label>
                  {t("dashboard")}
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://outreachdashboard.wmflabs.org/courses/Organisation/Programme"
                  />
                </label>
                <button disabled={busy} onClick={() => void perform(dashboard)}>
                  {t("importDashboard")}
                </button>
              </section>
              <NewAccountsImport onImport={importRegistrations} />
              <section className="panel">
                <h2>{t("archive")}</h2>
                <FileInput
                  label={t("archive")}
                  accept=".json"
                  onSelect={(file) =>
                    void perform(async () => {
                      const current = generation.current;
                      const imported = importArchive(
                        await readFile(file, true),
                      );
                      if (current !== generation.current) return;
                      imported.params.selection =
                        imported.params.creation_restriction ||
                        imported.params.selection === "new"
                          ? "new"
                          : "all";
                      imported.params.creation_restriction = false;
                      collector.current?.stop();
                      setDashboardDates(null);
                      customScopeInitialized.current =
                        imported.params.scope === "custom";
                      setDateChoice("");
                      setPendingExclusions({});
                      setExclusions("");
                      setS(imported);
                      setNotice(t("saved"));
                    })
                  }
                />
              </section>
            </div>
            {csv.length > 0 && (
              <section className="panel">
                <h2>{t("preview")}</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={csvHeader}
                    onChange={(e) => setCsvHeader(e.target.checked)}
                  />
                  {t("csvHeader")}
                </label>
                <label>
                  {t("column")}
                  <select
                    value={column}
                    onChange={(e) => setColumn(Number(e.target.value))}
                  >
                    {csv[0].map((header, i) => (
                      <option key={i} value={i}>
                        {header || String(i + 1)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {csv[0].map((header, i) => (
                          <th key={i}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csv
                        .slice(csvHeader ? 1 : 0, csvHeader ? 6 : 5)
                        .map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() =>
                    importText(
                      csv
                        .slice(csvHeader ? 1 : 0)
                        .map((row) => row[column] ?? "")
                        .join("\n"),
                    )
                  }
                >
                  {t("import")}
                </button>
              </section>
            )}
          </>
        )}
        {s.stage === 1 && (
          <>
            <h1>{t("importedParticipants")}</h1>
            <p>{t("qualificationNote")}</p>
            <p className="hint" role="status">
              {t(hasPendingExclusions ? "exclusionsPending" : "exclusionsHelp")}
            </p>
            <div className="actions">
              <button
                disabled={busy || !hasPendingExclusions}
                onClick={applyExclusions}
              >
                {t("applyExclusions")}
              </button>
              <span aria-hidden="true">→</span>
              <button
                className="primary"
                disabled={busy || hasPendingExclusions}
                onClick={() => void perform(qualify)}
              >
                {busy ? t("qualifying") : t("qualify")}
              </button>
              <button disabled={busy} onClick={() => update({ stage: 0 })}>
                {t("changeImport")}
              </button>
            </div>
            {busy && (
              <p role="status">
                {t("verificationProgress", {
                  done: s.cohort.filter((a) => a.qualified).length,
                  total: s.cohort.length,
                })}
              </p>
            )}
            <div className="form-grid">
              <label>
                {t(s.new_accounts ? "newAccounts.cohortTitle" : "title")}
                <input
                  value={s.params.title}
                  onChange={(e) => params({ title: e.target.value })}
                />
              </label>
            </div>
            <label>
              {t("exclusions")}
              <textarea
                rows={3}
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
              />
            </label>
            {s.diagnostics.length > 0 && (
              <details open>
                <summary>{t("observed")}</summary>
                <ul>
                  {s.diagnostics.map((d, i) => (
                    <li key={i}>{translateMessage(d)}</li>
                  ))}
                </ul>
              </details>
            )}
            <QualificationTable
              disabled={busy}
              accounts={s.cohort}
              start={s.params.start}
              pendingExclusions={pendingExclusions}
              toggle={(name) =>
                setPendingExclusions((previous) => ({
                  ...previous,
                  [name]: !(
                    previous[name] ??
                    !s.cohort.find((a) => a.username === name)!.included
                  ),
                }))
              }
              reason={(name, value) =>
                update({
                  cohort: s.cohort.map((a) =>
                    a.username === name ? { ...a, exclusion_reason: value } : a,
                  ),
                })
              }
            />
          </>
        )}
        {s.stage === 2 && (
          <>
            <h1>{t("steps.1")}</h1>
            <p>
              {t(
                s.new_accounts
                  ? "newAccounts.collectionNotice"
                  : "collectionNotice",
              )}
            </p>
            {s.new_accounts ? (
              <p className="notice">
                {t("newAccounts.cohortDates", s.new_accounts)}
              </p>
            ) : (
              eventDates
            )}
            {changed && <p className="notice">{t("errors.changed")}</p>}
            <div className="form-grid">
              <label>
                {t(s.new_accounts ? "newAccounts.cohortTitle" : "title")}
                <input
                  value={s.params.title}
                  onChange={(e) => params({ title: e.target.value })}
                />
              </label>
            </div>
            {!s.new_accounts && (
              <CreationSettings params={s.params} change={params} />
            )}
            <p role="status" className="selection-preview">
              {t("selectionPreview", {
                selected: result.n,
                total: s.cohort.filter((a) => a.included).length,
                unknown: s.cohort.filter((a) => a.included && !a.registration)
                  .length,
              })}
            </p>
            {result.n === 0 && <p className="notice">{t("zeroSelection")}</p>}
            <SelectionReview rows={result.rows} params={s.params} />
            {s.new_accounts ? (
              <ObservationSettings
                session={s}
                change={params}
                question={(q) => update({ question: q })}
              />
            ) : (
              <>
                <label>
                  {t("scope")}
                  <select
                    value={s.params.scope}
                    onChange={(e) => {
                      const scope = e.target.value as Params["scope"];
                      params({
                        scope,
                        ...(scope === "custom" &&
                        !customScopeInitialized.current
                          ? { projects: [] }
                          : {}),
                      });
                      if (scope === "custom")
                        customScopeInitialized.current = true;
                    }}
                  >
                    {["origin", "custom", "all"].map((k) => (
                      <option key={k} value={k}>
                        {t("scopes." + k)}
                      </option>
                    ))}
                  </select>
                </label>
                {s.params.scope === "origin" && projectPicker("origins")}
                {s.params.scope === "custom" && (
                  <>
                    {!s.params.projects.length && (
                      <p className="notice">{t("customScopeEmpty")}</p>
                    )}
                    {projectPicker("projects")}
                  </>
                )}
                {s.params.scope === "all" && (
                  <ProjectPicker
                    title="allCollectionProjects"
                    catalog={s.catalog}
                    selected={[
                      ...new Set(s.catalog.map((project) => project.id)),
                    ]}
                    readOnly
                    help="allCollectionProjectsHelp"
                    change={() => {}}
                    retry={() =>
                      void perform(async () =>
                        update({ catalog: await api<Project[]>("projects") }),
                      )
                    }
                  />
                )}
              </>
            )}
            <fieldset>
              <legend>{t("automation")}</legend>
              <p className="hint">{t("resultsFiltersHelp")}</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.params.exclude_automation}
                  onChange={(e) =>
                    params({ exclude_automation: e.target.checked })
                  }
                />
                {t("automation")}
              </label>
              <p className="hint">{t("automationHelp")}</p>
            </fieldset>
            <div className="actions">
              <button
                className="primary"
                disabled={
                  busy ||
                  (s.params.scope === "custom" && !s.params.projects.length)
                }
                onClick={() => void perform(() => launch(changed))}
              >
                {t(changed ? "restart" : "launch")}
              </button>
              {s.edits.length > 0 && (
                <button onClick={() => update({ stage: 4 })}>
                  {t("steps.3")}
                </button>
              )}
            </div>
          </>
        )}
        {s.stage === 3 && (
          <>
            <h1>{t("steps.2")}</h1>
            <p>
              {t(
                s.new_accounts
                  ? "newAccounts.collectionParameters"
                  : "collectionParameters",
                {
                  start:
                    s.params.observation?.mode === "period"
                      ? s.params.observation.start
                      : s.params.start,
                  end: s.params.observation?.end ?? s.params.end,
                  scope: t("scopes." + s.params.scope),
                  selection: t("selections." + s.params.selection),
                },
              )}
            </p>
            <p className="hint">
              {t("categories")} :{" "}
              {s.params.categories.map((c) => t("category." + c)).join(", ")}
            </p>
            <p className="hint">
              {t("collectionSelection", {
                retained: retainedAccounts.length,
                imported: s.cohort.length,
              })}
            </p>
            <p role="status">
              {t("progress", {
                done: processedAccounts,
                total: retainedAccounts.length,
              })}
            </p>
            <progress
              aria-label={t("steps.2")}
              max={retainedAccounts.length}
              value={processedAccounts}
            />
            <div className="kpis">
              {[
                "pending",
                "running",
                "retrying",
                "completed_primary",
                "completed_fallback",
                "partial",
                "failed",
              ].map((k) => (
                <div key={k}>
                  <span>{t("technical." + k)}</span>
                  <strong>
                    {retainedAccounts.filter((a) => a.technical === k).length}
                  </strong>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                onClick={() => {
                  if (paused) {
                    collector.current?.resume();
                    setPaused(false);
                  } else {
                    collector.current?.pause();
                    setPaused(true);
                  }
                }}
              >
                {t(paused ? "resume" : "pause")}
              </button>
              <button onClick={() => collector.current?.stop()}>
                {t("cancel")}
              </button>
            </div>
            <ul>
              {s.diagnostics
                .filter((d) => !isMessage(d, "fallback"))
                .slice(-5)
                .map((d, i) => (
                  <li key={i}>{translateMessage(d)}</li>
                ))}
            </ul>
          </>
        )}
        {s.stage === 4 && (
          <>
            <Suspense fallback={<p role="status">{t("loadingResults")}</p>}>
              <Results
                session={s}
                toggle={toggle}
                setQuestion={(question) => update({ question })}
                setParams={params}
                recollect={() =>
                  update({
                    params: { ...s.params, scope: "all", reference: today() },
                    stage: 2,
                  })
                }
              />
            </Suspense>
            {!result.complete && (
              <button
                disabled={busy}
                onClick={() => void perform(() => launch(true))}
              >
                {t("retry")}
              </button>
            )}
            <button onClick={() => update({ stage: 2 })}>{t("steps.1")}</button>
          </>
        )}
      </main>
      <footer>
        <p>
          <a href="https://meta.wikimedia.org/wiki/User:Mathieu_Denel_WMFr">
            Mathieu Denel WMFR
          </a>{" "}
          · {t("personalProject")}
        </p>
        <p>{t("privacy")} · GPL-3.0-or-later</p>
      </footer>
      <dialog
        ref={resetDialog}
        className="reset-dialog"
        aria-labelledby="reset-title"
        aria-describedby="reset-help"
      >
        <h2 id="reset-title">{t("newAnalysis")}</h2>
        <p id="reset-help">{t("resetHelp")}</p>
        <button
          className="backup-action"
          onClick={() => void import("./exports").then((m) => m.exportJSON(s))}
        >
          {t("saveBeforeReset")}
        </button>
        <div className="actions reset-actions">
          <button
            ref={resetCancelButton}
            onClick={() => resetDialog.current?.close()}
          >
            {t("keepAnalysis")}
          </button>
          <button className="primary" onClick={resetAnalysis}>
            {t("confirmReset")}
          </button>
        </div>
      </dialog>
    </div>
  );
}

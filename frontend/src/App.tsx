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
  const importRequest = useRef<AbortController | null>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
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
  function importText(text: string) {
    try {
      const data = importNames(text);
      if (!data.accounts.length) throw new Error(t("errors.names"));
      setS((previous) => ({
        ...emptySession(),
        catalog: previous.catalog,
        params: previous.params,
        cohort: data.accounts,
        diagnostics: data.diagnostics,
        stage: 1,
      }));
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
  function validateDates() {
    const p = s.params;
    const window = creationWindow(p);
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
    session.params.reference = today();
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
        start: "",
        end: "",
        origins: [origin],
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
      setCSV(parseCSV(text));
      setColumn(0);
    } else if (file.name.toLowerCase().endsWith(".txt")) importText(text);
    else throw new Error(t("errors.file"));
  }
  function resetAnalysis() {
    generation.current++;
    importRequest.current?.abort();
    collector.current?.stop();
    collector.current = null;
    setS(emptySession());
    setNames("");
    setUrl("");
    setCSV([]);
    setColumn(0);
    setCsvHeader(true);
    setExclusions("");
    setDashboardDates(null);
    setDateChoice("");
    setNotice("");
    setError("");
    setPaused(false);
    setBusy(false);
    resetDialog.current?.close();
  }
  function requestReset() {
    if (s.cohort.length || s.edits.length) resetDialog.current?.showModal();
    else resetAnalysis();
  }
  function projectPicker(key: "origins" | "projects") {
    return (
      <ProjectPicker
        title={key}
        catalog={s.catalog}
        selected={s.params[key]}
        change={(ids) => params({ [key]: ids })}
        retry={() =>
          void perform(async () =>
            update({ catalog: await api<Project[]>("projects") }),
          )
        }
      />
    );
  }
  const result = useMemo(() => aggregate(s), [s]),
    fallbackCount = s.cohort.filter((account) =>
      account.providers.includes("fallback"),
    ).length,
    activeCollection = busy && s.stage === 3,
    changed =
      s.collection_signature !== null &&
      s.collection_signature !== signature(s.params);
  // Keep the persisted stage IDs compatible with existing JSON archives.
  const navigationStages = [0, 2, 3, 4, 5];
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
          <span>
            {t("app")}
            <small>{t("tagline")}</small>
          </span>
        </a>
        <div className="header-actions">
          <button onClick={requestReset}>{t("newAnalysis")}</button>
          <button disabled={busy} onClick={() => update({ stage: 5 })}>
            {t("methodology")}
          </button>
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
      <nav aria-label={t("app")}>
        {(t("steps", { returnObjects: true }) as string[]).map((step, i) => (
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
              (i > 0 && i < 4 && !s.cohort.length) ||
              ((i === 2 || i === 3) && !s.collection_signature)
            }
            onClick={() => navigate(navigationStages[i])}
          >
            <span>{i + 1}</span>
            {step}
          </button>
        ))}
      </nav>
      <main id="main">
        <div role="status" className={notice ? "notice" : ""}>
          {translateMessage(notice)}
        </div>
        {fallbackCount > 0 && (s.stage === 3 || s.stage === 4) && (
          <p role="status" className="notice">
            {t("fallbackSummary", { count: fallbackCount })}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {translateMessage(error)}
          </p>
        )}
        {s.stage === 0 && (
          <>
            <section className="hero">
              <p className="eyebrow">{t("app")}</p>
              <h1>{t("introText")}</h1>
              <p className="privacy">{t("privacy")}</p>
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
                <div className="divider" />
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
                      setDateChoice("");
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
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void perform(qualify)}
              >
                {busy ? t("qualifying") : t("qualify")}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const excluded = new Set(
                    exclusions.split(/\r?\n/).map(normalize),
                  );
                  update({
                    cohort: s.cohort.map((a) =>
                      excluded.has(a.username)
                        ? {
                            ...a,
                            included: false,
                            exclusion_reason: t("excluded"),
                          }
                        : a,
                    ),
                  });
                }}
              >
                {t("applyExclusions")}
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
                {t("title")}
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
              toggle={toggle}
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
            <p>{t("collectionNotice")}</p>
            {eventDates}
            {changed && <p className="notice">{t("errors.changed")}</p>}
            <div className="form-grid">
              <label>
                {t("title")}
                <input
                  value={s.params.title}
                  onChange={(e) => params({ title: e.target.value })}
                />
              </label>
            </div>
            <CreationSettings params={s.params} change={params} />
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
            <label>
              {t("scope")}
              <select
                value={s.params.scope}
                onChange={(e) =>
                  params({ scope: e.target.value as Params["scope"] })
                }
              >
                {["origin", "custom", "all"].map((k) => (
                  <option key={k} value={k}>
                    {t("scopes." + k)}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-grid">
              {projectPicker("origins")}
              {s.params.scope === "custom" && projectPicker("projects")}
            </div>
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
                disabled={busy}
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
              {t("collectionParameters", {
                start: s.params.start,
                end: s.params.end,
                scope: t("scopes." + s.params.scope),
                selection: t("selections." + s.params.selection),
              })}
            </p>
            <p className="hint">
              {t("categories")} :{" "}
              {s.params.categories.map((c) => t("category." + c)).join(", ")}
            </p>
            <p role="status">
              {t("progress", {
                done: s.cohort.filter((a) =>
                  [
                    "completed_primary",
                    "completed_fallback",
                    "partial",
                    "failed",
                  ].includes(a.technical),
                ).length,
                total: s.cohort.length,
              })}
            </p>
            <progress
              max={s.cohort.length}
              value={
                s.cohort.filter((a) =>
                  [
                    "completed_primary",
                    "completed_fallback",
                    "partial",
                    "failed",
                  ].includes(a.technical),
                ).length
              }
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
                    {s.cohort.filter((a) => a.technical === k).length}
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
        {s.stage === 5 && (
          <>
            <h1>{t("methodology")}</h1>
            <p className="eyebrow">{t("methodVersion")}</p>
            <section className="method">
              {(t("methodText", { returnObjects: true }) as string[]).map(
                (text, i) => (
                  <p key={i}>{text}</p>
                ),
              )}
            </section>
            <p>
              <a
                href="https://www.mediawiki.org/wiki/Extension:CentralAuth/API"
                target="_blank"
                rel="noreferrer"
              >
                CentralAuth
              </a>{" "}
              ·{" "}
              <a
                href="https://www.mediawiki.org/wiki/API:Usercontribs"
                target="_blank"
                rel="noreferrer"
              >
                MediaWiki Action API
              </a>{" "}
              ·{" "}
              <a
                href="https://xtools.wmcloud.org/api"
                target="_blank"
                rel="noreferrer"
              >
                XTools
              </a>{" "}
              ·{" "}
              <a
                href="https://outreachdashboard.wmflabs.org"
                target="_blank"
                rel="noreferrer"
              >
                Programs & Events Dashboard
              </a>
            </p>
          </>
        )}
      </main>
      <footer>
        <p>{t("privacy")} · GPL-3.0-or-later</p>
        <details>
          <summary>{t("about")}</summary>
          <p>{t("aboutText")}</p>
          <p>
            <a
              href="https://mdenel.vercel.app"
              target="_blank"
              rel="noreferrer"
            >
              {t("authorSite")}
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/p5ykomat/observatoire-contributions"
              target="_blank"
              rel="noreferrer"
            >
              {t("sourceCode")}
            </a>
          </p>
        </details>
        <button onClick={requestReset}>{t("clear")}</button>
      </footer>
      <dialog
        ref={resetDialog}
        className="reset-dialog"
        aria-labelledby="reset-title"
        aria-describedby="reset-help"
      >
        <h2 id="reset-title">{t("newAnalysis")}</h2>
        <p id="reset-help">{t("resetHelp")}</p>
        <div className="actions">
          <button
            onClick={() =>
              void import("./exports").then((m) => m.exportJSON(s))
            }
          >
            {t("saveBeforeReset")}
          </button>
          <button autoFocus onClick={() => resetDialog.current?.close()}>
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

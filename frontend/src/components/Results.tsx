import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  analyzeFollowup,
  wikipediaLanguage,
  type FollowupResult,
} from "../analysis/followup";
import { exportCSV, exportJSON, exportPDF } from "../exports";
import { CATEGORIES, type FollowupQuestion, type Session } from "../types";
import { Chart } from "./Chart";

export function Results({
  session,
  toggle,
  setQuestion,
  recollect,
}: {
  session: Session;
  toggle: (name: string) => void;
  setQuestion: (question: FollowupQuestion) => void;
  recollect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [nominative, setNominative] = useState(false);
  const [search, setSearch] = useState("");
  const [languageSearch, setLanguageSearch] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const r = useMemo(() => analyzeFollowup(session), [session]);
  const q = r.question;
  const change = (patch: Partial<FollowupQuestion>) =>
    setQuestion({ ...q, ...patch });
  const families = [...new Set(session.catalog.map((p) => p.family))].sort();
  const languages = [
    ...new Set(
      session.catalog
        .filter((p) => p.family === "wikipedia")
        .map(wikipediaLanguage),
    ),
  ].sort();
  const familyName = (family: string) =>
    t("fup.families." + family, { defaultValue: family });
  const languageName = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([i18n.resolvedLanguage ?? "fr"], {
          type: "language",
        }).of(code) +
        " (" +
        code +
        ")"
      );
    } catch {
      return code;
    }
  };
  const switchItem = (values: string[], value: string, all: string[]) => {
    const list = values.includes("*") ? all : values;
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  };
  const familyCheck = (family: string) => (
    <label className="check" key={family}>
      <input
        type="checkbox"
        checked={q.families.includes("*") || q.families.includes(family)}
        onChange={() =>
          change({ families: switchItem(q.families, family, families) })
        }
      />
      {familyName(family)}
    </label>
  );
  const languageCheck = (code: string) => (
    <label className="check" key={code}>
      <input
        type="checkbox"
        checked={
          q.wikipedia_languages.includes("*") ||
          q.wikipedia_languages.includes(code)
        }
        onChange={() =>
          change({
            wikipedia_languages: switchItem(
              q.wikipedia_languages,
              code,
              languages,
            ),
          })
        }
      />
      {languageName(code)}
    </label>
  );
  const filtered = r.rows.filter((row) =>
    row.account.username
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, totalPages - 1);
  const selectedDetail = r.rows.find((row) => row.account.username === detail);
  const outcome = (row: FollowupResult["rows"][number]) =>
    !row.included ? t("fup.excluded") : t("fup." + row.outcome);
  const format = (value: number) => value.toLocaleString(i18n.resolvedLanguage);
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("steps.3")}</p>
          <h1>{session.params.title || t("app")}</h1>
          <p>
            {session.params.start} → {session.params.end} · {t("reference")} :{" "}
            {session.params.reference}
          </p>
        </div>
        <button onClick={() => exportJSON(session)}>{t("json")}</button>
      </div>
      <section
        className="panel followup-question"
        aria-labelledby="question-title"
      >
        <h2 id="question-title">{t("fup.title")}</h2>
        <p>{t("fup.help")}</p>
        <fieldset>
          <legend>{t("fup.deadline")}</legend>
          <div className="actions deadline-buttons">
            {([30, 60, 90, 120, 365, "today"] as const).map((days) => (
              <button
                key={days}
                aria-pressed={q.days === days}
                onClick={() => change({ days })}
              >
                {days === "today"
                  ? t("fup.today")
                  : t("dayAfter", { day: days })}
              </button>
            ))}
          </div>
          <p className="hint" id="deadline-help">
            {t("fup.deadlineHelp")}
          </p>
          <label className="custom-days">
            {t("fup.customDays")}
            <input
              type="number"
              min={1}
              max={36500}
              aria-describedby="deadline-help"
              value={q.days === "today" ? "" : q.days}
              onChange={(e) => change({ days: Number(e.target.value) })}
            />
          </label>
        </fieldset>
        <p className="query-period" role="status">
          {r.valid
            ? t("fup.interval", { start: r.start!, end: r.end! })
            : t("fup.invalid")}
        </p>
        <div className="settings-grid">
          <fieldset>
            <legend>{t("fup.projects")}</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={q.families.includes("*")}
                onChange={(e) =>
                  change({ families: e.target.checked ? ["*"] : [] })
                }
              />
              {t("fup.allFamilies")}
            </label>
            <div className="checks">
              {["wikipedia", "commons", "wikidata"]
                .filter((f) => families.includes(f))
                .map(familyCheck)}
            </div>
            <details>
              <summary>{t("fup.otherProjects")}</summary>
              <div className="checks">
                {families
                  .filter(
                    (f) => !["wikipedia", "commons", "wikidata"].includes(f),
                  )
                  .map(familyCheck)}
              </div>
            </details>
            <p className="hint">{t("fup.projectHelp")}</p>
          </fieldset>
          {(q.families.includes("*") || q.families.includes("wikipedia")) && (
            <fieldset>
              <legend>{t("fup.languages")}</legend>
              <div className="checks">
                {["fr", "en"]
                  .filter((code) => languages.includes(code))
                  .map(languageCheck)}
              </div>
              <details>
                <summary>{t("fup.otherLanguages")}</summary>
                <p className="hint">{t("fup.languageHelp")}</p>
                <label>
                  {t("fup.languageSearch")}
                  <input
                    value={languageSearch}
                    onChange={(e) => setLanguageSearch(e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={q.wikipedia_languages.includes("*")}
                    onChange={(e) =>
                      change({
                        wikipedia_languages: e.target.checked
                          ? ["*"]
                          : ["fr", "en"],
                      })
                    }
                  />
                  {t("fup.allLanguages")}
                </label>
                <div className="checks language-list">
                  {languages
                    .filter(
                      (code) =>
                        !["fr", "en"].includes(code) &&
                        languageName(code)
                          .toLocaleLowerCase()
                          .includes(languageSearch.toLocaleLowerCase()),
                    )
                    .map(languageCheck)}
                </div>
              </details>
            </fieldset>
          )}
        </div>
        {(q.families.includes("*") || q.families.includes("wikipedia")) && (
          <details className="wiki-categories">
            <summary>{t("fup.wikipediaCategories")}</summary>
            <p>{t("fup.categoriesHelp")}</p>
            <div className="checks">
              {CATEGORIES.filter(
                (category) => !["STRUCTURED_DATA", "MEDIA"].includes(category),
              ).map((category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={q.wikipedia_categories.includes(category)}
                    onChange={() =>
                      change({
                        wikipedia_categories: q.wikipedia_categories.includes(
                          category,
                        )
                          ? q.wikipedia_categories.filter((c) => c !== category)
                          : [...q.wikipedia_categories, category],
                      })
                    }
                  />
                  <span>
                    {t("category." + category)}
                    <small className="category-example">
                      {t("categoryExamples." + category)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
        <p className="hint">{t("fup.otherCategories")}</p>
      </section>
      {!r.valid && <p className="notice">{t("fup.invalid")}</p>}
      {!r.enabled && <p className="notice">{t("fup.noProjects")}</p>}
      {!r.reached && r.valid && (
        <p className="notice">
          {t("fup.notReached", {
            date: r.end!,
            observed: session.params.reference,
          })}
        </p>
      )}
      {!r.scopeCovered && <p className="notice">{t("fup.missingScope")}</p>}
      {(!r.scopeCovered || (!r.reached && q.days === "today")) && (
        <button onClick={recollect}>{t("fup.recollect")}</button>
      )}
      {r.n === 0 ? (
        <p role="status" className="notice">
          {t("noParticipantsResults")}
        </p>
      ) : (
        !r.complete && <p className="notice">{t("partial")}</p>
      )}
      <p className="collection-summary">
        {t("resultsCoverage", {
          retained: r.n,
          complete: r.included.filter((row) => row.complete).length,
          pending: r.included.filter((row) => !row.complete).length,
        })}
      </p>
      <div className="kpis">
        {[
          [t("retained"), r.n],
          [t("fup.contributing"), r.active],
          [t("fup.not_contributing"), r.inactive],
          [t("fup.unknown"), r.unknown],
          [t("totalEdits"), r.totalEdits],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{format(Number(value))}</strong>
          </div>
        ))}
      </div>
      <p className="notice">
        {r.complete
          ? t("fup.answer", {
              active: r.active,
              total: r.n,
              rate: r.rate!.toLocaleString(i18n.resolvedLanguage, {
                maximumFractionDigits: 1,
              }),
            })
          : t("fup.minimum", { active: r.active, total: r.n })}
      </p>
      <div className="charts">
        <Chart
          title={t("fup.activityTitle")}
          description={t("fup.activityHelp")}
          kind="pie"
          countUnit="participants"
          percentageBase={r.n}
          points={[
            { label: t("fup.contributing"), value: r.active },
            { label: t("fup.not_contributing"), value: r.inactive },
            { label: t("fup.unknown"), value: r.unknown },
          ]}
        />
        <Chart
          title={t("fup.projectTitle")}
          description={t("fup.familyHelp")}
          countUnit="participants"
          percentageBase={r.n}
          points={r.byFamily.map((f) => ({
            label: familyName(f.family),
            value: f.active,
          }))}
        />
      </div>
      <section className="panel" aria-labelledby="family-balance-title">
        <h2 id="family-balance-title">{t("fup.projectTable")}</h2>
        <div className="table-scroll">
          <table className="participant-table">
            <thead>
              <tr>
                <th>{t("fup.familyColumn")}</th>
                <th>{t("fup.contributing")}</th>
                <th>{t("fup.observedRate")}</th>
              </tr>
            </thead>
            <tbody>
              {r.byFamily.map((f) => (
                <tr key={f.family}>
                  <td data-label={t("fup.familyColumn")}>
                    {familyName(f.family)}
                  </td>
                  <td data-label={t("fup.contributing")}>{format(f.active)}</td>
                  <td data-label={t("fup.observedRate")}>
                    {f.percent === null
                      ? t("unavailable")
                      : f.percent.toLocaleString(i18n.resolvedLanguage, {
                          maximumFractionDigits: 1,
                        }) + " %"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">{t("fup.familyHelp")}</p>
      </section>
      <section className="panel">
        <h2>{t("detail")}</h2>
        <p>{t("fup.tableHelp")}</p>
        <label>
          {t("search")}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="table-scroll">
          <table className="participant-table followup-table">
            <caption>{t("fup.tableCaption")}</caption>
            <thead>
              <tr>
                {[
                  t("excludeQuestion"),
                  t("username"),
                  t("fup.outcome"),
                  t("contributions"),
                  t("last"),
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(currentPage * 25, currentPage * 25 + 25)
                .map((row) => (
                  <tr key={row.account.username}>
                    <td data-label={t("excludeQuestion")}>
                      <input
                        type="checkbox"
                        aria-label={t("excludeAccount", {
                          name: row.account.username,
                        })}
                        checked={!row.account.included}
                        onChange={() => toggle(row.account.username)}
                      />
                    </td>
                    <td data-label={t("username")}>
                      <button
                        className="link"
                        onClick={() => setDetail(row.account.username)}
                      >
                        {row.account.username}
                      </button>
                    </td>
                    <td data-label={t("fup.outcome")}>
                      <strong>{outcome(row)}</strong>
                      <small className="category-example">
                        {row.projects
                          .map(
                            (id) =>
                              session.catalog.find((p) => p.id === id)
                                ?.domain ?? id,
                          )
                          .join(", ")}
                      </small>
                    </td>
                    <td data-label={t("contributions")}>
                      {format(row.edits.length)}
                    </td>
                    <td data-label={t("last")}>
                      {row.last?.slice(0, 10) ?? t("fup.noObserved")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="actions">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("previous")}
          </button>
          <span>{t("page", { page: currentPage + 1, total: totalPages })}</span>
          <button
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("next")}
          </button>
        </div>
        <p className="hint">{t("fup.renameHelp")}</p>
      </section>
      {selectedDetail && (
        <section className="panel individual" aria-label={t("detail")}>
          <h2>{selectedDetail.account.username}</h2>
          <button onClick={() => setDetail(null)}>{t("close")}</button>
          <p>
            {outcome(selectedDetail)} · {format(selectedDetail.edits.length)}{" "}
            {t("contributions")}
          </p>
          <p>
            {t("providers")}: {selectedDetail.account.providers.join(", ")}
          </p>
          <p>{t("timelineLimit")}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("reference")}</th>
                  <th>{t("projects")}</th>
                  <th>{t("title")}</th>
                </tr>
              </thead>
              <tbody>
                {selectedDetail.edits
                  .slice(-100)
                  .reverse()
                  .map((edit) => (
                    <tr key={edit.project + ":" + edit.revision}>
                      <td>{edit.timestamp.slice(0, 10)}</td>
                      <td>
                        {session.catalog.find((p) => p.id === edit.project)
                          ?.domain ?? edit.project}
                      </td>
                      <td>{edit.title}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>{t("exports")}</h2>
        <p>{t("fup.exportHelp")}</p>
        <p className="hint">{t("saveHelp")}</p>
        <div className="actions">
          <button onClick={() => exportCSV(session)}>{t("csv")}</button>
          <button onClick={() => exportCSV(session, true)}>
            {t("summary")}
          </button>
          <button onClick={() => exportJSON(session)}>{t("json")}</button>
          <button onClick={() => exportPDF(session, nominative)}>
            {t("pdf")}
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={nominative}
            onChange={(e) => setNominative(e.target.checked)}
          />
          {t("nominative")}
        </label>
      </section>
    </>
  );
}

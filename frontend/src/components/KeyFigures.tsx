import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Session, ArticleStatus, ArticleTopics } from "../types";
import type { FollowupResult } from "../analysis/followup";
import { ArticleStatistics } from "./ArticleStatistics";
import { WikipediaTopics } from "./WikipediaTopics";
import { contributionsURL } from "../analysis/contributionLinks";
import { activityDays, observedContributions } from "../analysis/activity";

export function KeyFigures({
  session,
  result,
  saveArticleStatus,
  saveTopics,
}: {
  session: Session;
  result: FollowupResult;
  saveArticleStatus: (cache: Record<string, ArticleStatus>) => void;
  saveTopics: (
    cache: Record<string, ArticleTopics>,
    kind: "creation" | "modification" | "both",
  ) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <details
        className="key-figures"
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>
          <h2>{t("keyFigures.title")}</h2>
        </summary>
        {open && (
          <>
            <ArticleStatistics
              session={session}
              result={result}
              save={saveArticleStatus}
            />
            <h3>{t("keyFigures.accountsTitle")}</h3>
            {result.active ? (
              <Figures session={session} result={result} />
            ) : (
              <p>{t("activity.empty")}</p>
            )}
            <WikipediaTopics
              session={session}
              result={result}
              save={saveTopics}
            />
          </>
        )}
      </details>
    </section>
  );
}
function Names({
  names,
  session,
  result,
}: {
  names: string[];
  session: Session;
  result: FollowupResult;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(names.length / 25)),
    current = Math.min(page, pages - 1);
  if (!names.length) return null;
  return (
    <details>
      <summary>{t("keyFigures.names", { count: names.length })}</summary>
      <ul>
        {names.slice(current * 25, current * 25 + 25).map((name) => (
          <li key={name}>
            {name}{" "}
            {(
              result.rows.find((row) => row.account.username === name)
                ?.projects ?? []
            ).map((id) => {
              const project = session.catalog.find(
                (project) => project.id === id,
              );
              const href = project && contributionsURL(project, name);
              return href ? (
                <a
                  className="statistics-account-link"
                  key={id}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("keyFigures.contributionsOn", { project: project.domain })}
                </a>
              ) : null;
            })}
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="actions">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            {t("previous")}
          </button>
          <span>{t("page", { page: current + 1, total: pages })}</span>
          <button
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </details>
  );
}
function Figures({
  session,
  result,
}: {
  session: Session;
  result: FollowupResult;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "fr";
  const facts = useMemo(() => {
    const edits = observedContributions(result),
      days = activityDays(edits);
    const sorted = [...days.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    const hours = Array<number>(24).fill(0);
    for (const edit of edits) hours[new Date(edit.timestamp).getUTCHours()]++;
    const maxHour = Math.max(...hours),
      hour = hours.indexOf(maxHour);
    const counts = result.included
      .filter((row) => row.edits.length)
      .map((row) => row.edits.length)
      .sort((a, b) => a - b);
    const names = (
      predicate: (row: FollowupResult["rows"][number]) => boolean,
    ) => result.included.filter(predicate).map((row) => row.account.username);
    return {
      activeDays: days.size,
      record: sorted[0],
      tiedDays: sorted.filter((row) => row[1].length === sorted[0]?.[1].length)
        .length,
      hour,
      maxHour,
      average: counts.length ? edits.length / counts.length : 0,
      single: names((row) => row.edits.length === 1),
      multi: names((row) => row.projects.length > 1),
      multiFamilies: names(
        (row) =>
          new Set(
            row.projects.map(
              (id) => session.catalog.find((p) => p.id === id)?.family ?? id,
            ),
          ).size > 1,
      ),
    };
  }, [result, session.catalog]);
  const fmt = (n: number) =>
    n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const percent = (count: number) =>
    fmt(result.active ? (count / result.active) * 100 : 0);
  return (
    <div className="key-figures-content">
      <p className="hint">{t("keyFigures.help")}</p>
      {!result.complete && <p className="notice">{t("activity.partial")}</p>}
      <ul className="facts-list">
        <li>{t("keyFigures.activeDays", { count: facts.activeDays })}</li>
        {facts.record && (
          <li>
            {t("keyFigures.record", {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: "full",
                timeZone: "UTC",
              }).format(new Date(facts.record[0] + "T00:00:00Z")),
              count: facts.record[1].length,
            })}
            {facts.tiedDays > 1 && (
              <small className="category-example">
                {t("keyFigures.ties", { count: facts.tiedDays })}
              </small>
            )}
          </li>
        )}
        {facts.maxHour > 0 && (
          <li>
            {t("keyFigures.hour", {
              start: String(facts.hour).padStart(2, "0"),
              end: String((facts.hour + 1) % 24).padStart(2, "0"),
              count: facts.maxHour,
            })}
          </li>
        )}
        <li>
          {t("keyFigures.average", {
            mean: fmt(facts.average),
            count: result.active,
          })}
        </li>
        <li>
          {t("keyFigures.single", {
            count: facts.single.length,
            percent: percent(facts.single.length),
          })}
          <Names names={facts.single} session={session} result={result} />
        </li>
        <li>
          {t("keyFigures.multi", {
            count: facts.multi.length,
            percent: percent(facts.multi.length),
          })}
          <Names names={facts.multi} session={session} result={result} />
        </li>
        <li>
          {t("keyFigures.multiFamilies", {
            count: facts.multiFamilies.length,
            percent: percent(facts.multiFamilies.length),
          })}
          <Names
            names={facts.multiFamilies}
            session={session}
            result={result}
          />
        </li>
      </ul>
    </div>
  );
}

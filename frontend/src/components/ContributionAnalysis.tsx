import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Session } from "../types";
import type { FollowupResult } from "../analysis/followup";
import {
  observedContributions,
  projectActivity,
  contributionURL,
} from "../analysis/activity";
import { wikipediaActivity } from "../analysis/articleTopics";

export function ContributionAnalysis({
  session,
  result,
}: {
  session: Session;
  result: FollowupResult;
}) {
  const { t, i18n } = useTranslation();
  const edits = useMemo(() => observedContributions(result), [result]);
  const projects = useMemo(
    () => projectActivity(edits, session.catalog),
    [edits, session.catalog],
  );
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(edits.length / 50)),
    current = Math.min(page, count - 1);
  const wikipedia = useMemo(
    () => wikipediaActivity(result, session),
    [result, session],
  );
  const fmt = (n: number) =>
    n.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
  return (
    <section
      className="panel contribution-analysis"
      aria-labelledby="contribution-analysis-title"
    >
      <h2 id="contribution-analysis-title">{t("activity.title")}</h2>
      <p>
        {t("activity.summary", {
          count: edits.length,
          accounts: result.active,
        })}
      </p>
      <p className="hint">{t("activity.help")}</p>
      {!result.complete && <p className="notice">{t("activity.partial")}</p>}
      <table>
        <caption>{t("activity.byProject")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("activity.project")}</th>
            <th scope="col">{t("contributions")}</th>
            <th scope="col">{t("activity.share")}</th>
            <th scope="col">{t("activity.accounts")}</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.project}>
              <th scope="row">{p.domain}</th>
              <td>{fmt(p.count)}</td>
              <td>{fmt(p.percent)} %</td>
              <td>{fmt(p.contributors)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t("activity.total")}</th>
            <td>{fmt(edits.length)}</td>
            <td>{edits.length ? "100 %" : "0 %"}</td>
            <td>{fmt(result.active)}</td>
          </tr>
        </tfoot>
      </table>
      {wikipedia.contributions > 0 && (
        <p>
          {t("activity.wikipedia", {
            total: wikipedia.contributions,
            creations: wikipedia.creations,
            modifications: wikipedia.modifications,
          })}
          {wikipedia.unknownType > 0 &&
            " " +
              t("activity.wikipediaUnknown", {
                count: wikipedia.unknownType,
              })}
        </p>
      )}
      {projects.length === 0 && <p>{t("activity.empty")}</p>}
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>{t("activity.details")}</summary>
        {open && (
          <>
            <p className="hint">{t("activity.detailHelp")}</p>
            <table>
              <caption>{t("activity.details")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("username")}</th>
                  <th scope="col">{t("activity.project")}</th>
                  <th scope="col">{t("activity.page")}</th>
                  <th scope="col">{t("activity.date")}</th>
                  <th scope="col">{t("activity.link")}</th>
                </tr>
              </thead>
              <tbody>
                {edits.slice(current * 50, current * 50 + 50).map((e) => {
                  const url = contributionURL(e, session.catalog);
                  return (
                    <tr key={e.project + ":" + e.revision}>
                      <th scope="row">{e.username}</th>
                      <td>
                        {session.catalog.find((p) => p.id === e.project)
                          ?.domain ?? e.project}
                      </td>
                      <td>
                        {e.title}
                        {e.deleted_page && (
                          <small className="category-example">
                            {t("deleted.revision")}
                          </small>
                        )}
                      </td>
                      <td>
                        <time dateTime={e.timestamp}>
                          {new Date(e.timestamp)
                            .toISOString()
                            .replace("T", " ")
                            .slice(0, 19)}{" "}
                          UTC
                        </time>
                      </td>
                      <td>
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer">
                            {t(
                              e.deleted_page
                                ? "activity.deletionLink"
                                : "activity.link",
                            )}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="actions">
              <button disabled={!current} onClick={() => setPage(current - 1)}>
                {t("previous")}
              </button>
              <span>{t("page", { page: current + 1, total: count })}</span>
              <button
                disabled={current + 1 >= count}
                onClick={() => setPage(current + 1)}
              >
                {t("next")}
              </button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}

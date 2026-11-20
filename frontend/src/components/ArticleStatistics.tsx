import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArticleStatus, Session } from "../types";
import type { FollowupResult } from "../analysis/followup";
import {
  articleEdits,
  articleKey,
  creationType,
  creationKey,
} from "../analysis/articleTopics";
import { api, retry } from "../api";

export function ArticleStatistics({
  session,
  result,
  save,
}: {
  session: Session;
  result: FollowupResult;
  save: (values: Record<string, ArticleStatus>) => void;
}) {
  const { t, i18n } = useTranslation();
  const creations = useMemo(
    () =>
      articleEdits(result, session).filter(
        (edit) =>
          creationType(edit, session.article_topics?.[articleKey(edit)]) ===
          true,
      ),
    [result, session],
  );
  const key = creations
    .map((edit) => creationKey(edit.project, edit.revision))
    .join("|");
  const input = useRef(creations);
  input.current = creations;
  const saved = useRef(save);
  saved.current = save;
  const values = useRef(session.article_status ?? {});
  const controller = useRef<AbortController | null>(null);
  const [cache, setCache] = useState(values.current);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);

  const load = useRef<(refresh: boolean) => Promise<void>>(async () => {});
  load.current = async (refresh: boolean) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const all = [...input.current];
    const pending = all.filter(
      (edit) =>
        refresh ||
        !values.current[creationKey(edit.project, edit.revision)] ||
        values.current[creationKey(edit.project, edit.revision)].status ===
          "unavailable",
    );
    if (!pending.length) {
      setProgress(null);
      setRunning(false);
      return;
    }
    setRunning(true);
    setProgress({ done: all.length - pending.length, total: all.length });
    const projects = [...new Set(pending.map((edit) => edit.project))];
    let done = all.length - pending.length;
    try {
      for (const project of projects) {
        const edits = pending.filter((edit) => edit.project === project);
        for (
          let index = 0;
          index < edits.length && !abort.signal.aborted;
          index += 50
        ) {
          const batch = edits.slice(index, index + 50);
          let rows: ArticleStatus[] = [];
          try {
            const response = await retry(
              () =>
                api<{ pages: ArticleStatus[] }>(
                  "article-status",
                  {
                    project,
                    creations: batch.map(
                      ({
                        revision,
                        title,
                        page_id,
                        timestamp,
                        deleted_page,
                      }) => ({
                        revision,
                        title,
                        page_id,
                        timestamp,
                        deleted_page: deleted_page === true,
                      }),
                    ),
                  },
                  abort.signal,
                ),
              () => {},
              abort.signal,
            );
            rows = response.pages.filter(
              (row) =>
                row.project === project &&
                batch.some((edit) => edit.revision === row.revision) &&
                ["online", "deleted", "unavailable"].includes(row.status),
            );
          } catch {
            if (abort.signal.aborted) return;
          }
          if (abort.signal.aborted) return;
          for (const edit of batch) {
            const row = rows.find((row) => row.revision === edit.revision) ?? {
              project,
              revision: edit.revision,
              title: edit.title,
              current_title: edit.title,
              page_id: null,
              status: "unavailable" as const,
              recreated: false,
              redirect: false,
              disambiguation: false,
              checked_at: new Date().toISOString(),
            };
            values.current = {
              ...values.current,
              [creationKey(project, edit.revision)]: row,
            };
          }
          done += batch.length;
          setCache(values.current);
          setProgress({ done, total: all.length });
        }
      }
    } finally {
      if (controller.current === abort && !abort.signal.aborted) {
        setRunning(false);
        saved.current(values.current);
      }
    }
  };
  useEffect(() => {
    void load.current(false);
    return () => controller.current?.abort();
  }, [key]);
  const states = creations.map(
    (edit) => cache[creationKey(edit.project, edit.revision)],
  );
  const online = states.filter((state) => state?.status === "online").length;
  const deleted = states.filter((state) => state?.status === "deleted").length;
  const recreated = states.filter(
    (state) => state?.status === "deleted" && state.recreated,
  ).length;
  const otherPages = states.filter(
    (state) =>
      state?.status === "online" && (state.redirect || state.disambiguation),
  ).length;
  const checked = states
    .filter(Boolean)
    .map((state) => state.checked_at)
    .sort()
    .at(-1);
  const unconfirmed = creations.filter(
    (edit) =>
      !cache[creationKey(edit.project, edit.revision)] ||
      cache[creationKey(edit.project, edit.revision)].status === "unavailable",
  );
  const pageCount = Math.max(1, Math.ceil(unconfirmed.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <section
      className="article-statistics"
      aria-labelledby="article-statistics-title"
    >
      <h3 id="article-statistics-title">{t("articleStats.title")}</h3>
      <p>
        {t("articleStats.period", {
          start: result.start,
          end: result.observedEnd,
        })}
      </p>
      <p>{t("articleStats.total", { count: creations.length })}</p>
      <p className="hint">{t("activity.creationsScope")}</p>
      {running ? (
        <p role="status">
          {t(
            "articleStats.progress",
            progress ?? { done: 0, total: creations.length },
          )}
        </p>
      ) : (
        <>
          <ul className="article-status-counts">
            <li>{t("articleStats.online", { count: online })}</li>
            <li>{t("articleStats.deleted", { count: deleted })}</li>
            {creations.length - online - deleted > 0 && (
              <li>
                {t("articleStats.unknown", {
                  count: creations.length - online - deleted,
                })}
              </li>
            )}
            {recreated > 0 && (
              <li>{t("articleStats.recreated", { count: recreated })}</li>
            )}
            {otherPages > 0 && (
              <li>{t("articleStats.otherPages", { count: otherPages })}</li>
            )}
          </ul>
          {checked && (
            <p className="hint">
              {t("articleStats.checked", {
                date: new Date(checked).toLocaleString(i18n.resolvedLanguage, {
                  timeZone: "UTC",
                }),
              })}
            </p>
          )}
        </>
      )}
      <p className="hint">{t("articleStats.help")}</p>
      {!running && unconfirmed.length > 0 && (
        <>
          <p className="hint">{t("articleStats.unavailableHelp")}</p>
          <details>
            <summary>{t("articleStats.unconfirmedPages")}</summary>
            <ul>
              {unconfirmed
                .slice(currentPage * 50, currentPage * 50 + 50)
                .map((edit) => (
                  <li key={creationKey(edit.project, edit.revision)}>
                    {edit.title} (
                    {session.catalog.find(
                      (project) => project.id === edit.project,
                    )?.domain ?? edit.project}
                    )
                  </li>
                ))}
            </ul>
            {pageCount > 1 && (
              <div className="actions">
                <button
                  disabled={!currentPage}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("previous")}
                </button>
                <span>
                  {t("page", { page: currentPage + 1, total: pageCount })}
                </span>
                <button
                  disabled={currentPage + 1 >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("next")}
                </button>
              </div>
            )}
          </details>
        </>
      )}
      {creations.length > 0 && (
        <button disabled={running} onClick={() => void load.current(true)}>
          {t("articleStats.refresh")}
        </button>
      )}
    </section>
  );
}

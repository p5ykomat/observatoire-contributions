import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Papa from "papaparse";
import type { ArticleTopics, Session } from "../types";
import type { FollowupResult } from "../analysis/followup";
import {
  articleEdits,
  articleKey,
  summarizeArticles,
  type ArticleKind,
  type TopicMetric,
} from "../analysis/articleTopics";
import { api, retry } from "../api";
import { download } from "../exports";

export function WikipediaTopics({
  session,
  result,
  save,
}: {
  session: Session;
  result: FollowupResult;
  save: (cache: Record<string, ArticleTopics>) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ArticleKind>("both");
  const [metric, setMetric] = useState<TopicMetric>("contributors");
  const [detailed, setDetailed] = useState(false);
  const [cache, setCache] = useState(session.article_topics ?? {});
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const values = useRef(cache);
  const saveRef = useRef(save);
  saveRef.current = save;
  const edits = useMemo(() => articleEdits(result, session), [result, session]);
  const queryKey = edits.map((e) => e.project + ":" + e.revision).join("|");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    setRunning(false);
    setProgress(null);
  }, [queryKey]);
  const summary = useMemo(
    () => summarizeArticles(edits, cache, kind, metric, detailed),
    [edits, cache, kind, metric, detailed],
  );
  const number = (n: number) =>
    n.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
  const share = (n: number, total: number) =>
    total ? number((n / total) * 100) + " %" : "0 %";
  const topicLabel = (topic: string) =>
    detailed
      ? t(
          "topics.labels." +
            topic.split(".").at(-1)!.replaceAll("*", "").toLowerCase(),
          { defaultValue: topic.split(".").at(-1)!.replaceAll("_", " ") },
        )
      : t("topics.groups." + topic);
  const needsWork = edits.some(
    (edit) =>
      !cache[articleKey(edit)] ||
      cache[articleKey(edit)].status === "unavailable",
  );
  async function run() {
    setOpen(true);
    if (controller.current && !controller.current.signal.aborted) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    const articles = [
      ...new Map(edits.map((e) => [articleKey(e), e])).entries(),
    ];
    let done = articles.filter(
      ([key]) =>
        values.current[key] && values.current[key].status !== "unavailable",
    ).length;
    setProgress({ done, total: articles.length });
    try {
      for (const [key, edit] of articles) {
        if (abort.signal.aborted) break;
        if (values.current[key] && values.current[key].status !== "unavailable")
          continue;
        let metadata: ArticleTopics;
        try {
          metadata = await retry(
            () =>
              api<ArticleTopics>(
                "article-topics",
                {
                  project: edit.project,
                  title: edit.title,
                  page_id: edit.page_id,
                },
                abort.signal,
              ),
            () => {},
            abort.signal,
          );
          if (
            !["classified", "unclassified", "excluded"].includes(
              metadata.status,
            ) ||
            metadata.model !== "outlink-topic-model" ||
            metadata.threshold !== 0.5 ||
            !Array.isArray(metadata.topics)
          )
            throw new Error("Invalid model response");
        } catch {
          if (abort.signal.aborted) break;
          metadata = {
            project: edit.project,
            title: edit.title,
            page_id: edit.page_id ?? null,
            first_revision: null,
            model: "outlink-topic-model",
            threshold: 0.5,
            fetched_at: new Date().toISOString(),
            status: "unavailable",
            topics: [],
          };
        }
        if (abort.signal.aborted) break;
        values.current = { ...values.current, [key]: metadata };
        setCache(values.current);
        setProgress({ done: ++done, total: articles.length });
      }
    } finally {
      if (alive.current && controller.current === abort) {
        controller.current = null;
        setRunning(false);
        saveRef.current(values.current);
      }
    }
  }
  return (
    <section className="panel wikipedia-topics" aria-labelledby="topics-title">
      <h2 id="topics-title">{t("topics.title")}</h2>
      <p>{t("topics.intro")}</p>
      <details className="topic-method">
        <summary>{t("topics.methodTitle")}</summary>
        <p>{t("topics.method")}</p>
        <p>{t("topics.methodLimits")}</p>
        <a
          href="https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic"
          target="_blank"
          rel="noreferrer"
        >
          {t("topics.modelLink")}
        </a>
      </details>
      <div className="actions">
        <button
          className="primary"
          aria-expanded={open}
          aria-controls={open ? "topic-analysis-content" : undefined}
          disabled={running || !edits.length || (open && !needsWork)}
          onClick={() => void run()}
        >
          {t(
            open
              ? needsWork
                ? "topics.resume"
                : "topics.complete"
              : "topics.launch",
          )}
        </button>
        {running && (
          <button onClick={() => controller.current?.abort()}>
            {t("pause")}
          </button>
        )}
        {open && (
          <button
            aria-expanded={open}
            onClick={() => {
              controller.current?.abort();
              setOpen(false);
            }}
          >
            {t("topics.hide")}
          </button>
        )}
      </div>
      {!edits.length && <p className="hint">{t("topics.empty")}</p>}
      {open && (
        <div id="topic-analysis-content">
          {!result.complete && <p className="notice">{t("topics.partial")}</p>}
          {progress && <p role="status">{t("topics.progress", progress)}</p>}
          {running && (
            <progress
              aria-label={t("topics.progressLabel")}
              max={progress?.total || 1}
              value={progress?.done ?? 0}
            />
          )}
          <p className="hint">{t("topics.period")}</p>
          <div className="settings-grid">
            <label>
              <span id="topics-kind-label">{t("topics.kind")}</span>
              <select
                aria-labelledby="topics-kind-label"
                value={kind}
                onChange={(e) => setKind(e.target.value as ArticleKind)}
              >
                {(["both", "creation", "modification"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t("topics.kinds." + v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span id="topics-metric-label">{t("topics.metric")}</span>
              <select
                aria-labelledby="topics-metric-label"
                value={metric}
                onChange={(e) => setMetric(e.target.value as TopicMetric)}
              >
                {(["contributors", "articles", "edits"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t("topics.metrics." + v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="notice">
            {t("topics.answer", {
              contributors: number(summary.contributors),
              total: number(result.n),
              rate: share(summary.contributors, result.n),
              articles: number(summary.articles),
              edits: number(summary.selected.length),
            })}
          </p>
          <h3>{t("topics.volumeTitle")}</h3>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t("topics.volumeTitle")}
          >
            <table>
              <caption>{t("topics.volumeCaption")}</caption>
              <thead>
                <tr>
                  <th>{t("topics.kind")}</th>
                  <th>{t("count")}</th>
                  <th>{t("topics.share")}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["creation", summary.creations],
                  ["modification", summary.modifications],
                  ["unknown", summary.unknownType],
                ].map(([label, count]) => (
                  <tr key={label}>
                    <th scope="row">{t("topics.kinds." + label)}</th>
                    <td>{number(Number(count))}</td>
                    <td>{share(Number(count), summary.eligible.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.unknownType > 0 && (
            <p className="hint">{t("topics.unknownType")}</p>
          )}
          <h3>{t("topics.ranking")}</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={detailed}
              onChange={(e) => setDetailed(e.target.checked)}
            />
            {t("topics.detailed")}
          </label>
          <p className="hint">
            {t("topics.base." + metric, { count: number(summary.base) })}{" "}
            {t("topics.overlap")}
          </p>
          <p role="status">
            {t("topics.coverage", {
              classified: number(summary.classified),
              total: number(summary.articles),
              rate: share(summary.classified, summary.articles),
              unclassified: number(summary.unclassified),
              unavailable: number(summary.unavailable),
              pending: number(summary.pending),
            })}
          </p>
          {summary.unavailable > 0 && (
            <p className="notice">{t("topics.unavailable")}</p>
          )}
          {summary.excluded > 0 && (
            <p className="hint">
              {t("topics.excluded", { count: summary.excluded })}
            </p>
          )}
          {summary.rows.length ? (
            <>
              <ol className="topic-bars" aria-label={t("topics.ranking")}>
                {summary.rows.slice(0, 10).map((row) => (
                  <li key={row.topic}>
                    <span className="topic-name">{topicLabel(row.topic)}</span>
                    <span className="topic-bar-track" aria-hidden="true">
                      <span style={{ width: row.percent + "%" }} />
                    </span>
                    <strong>
                      {number(row.count)} ({number(row.percent)} %)
                    </strong>
                  </li>
                ))}
              </ol>
              <details>
                <summary>{t("topics.allThemes")}</summary>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={t("topics.ranking")}
                >
                  <table>
                    <caption>{t("topics.ranking")}</caption>
                    <thead>
                      <tr>
                        <th>{t("topics.theme")}</th>
                        <th>{t("count")}</th>
                        <th>{t("topics.share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr key={row.topic}>
                          <th scope="row">{topicLabel(row.topic)}</th>
                          <td>{number(row.count)}</td>
                          <td>{number(row.percent)} %</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <button
                onClick={() =>
                  download(
                    new Blob(
                      [
                        "\ufeff" +
                          Papa.unparse(
                            summary.rows.map((row) => ({
                              theme: topicLabel(row.topic),
                              metric,
                              kind,
                              count: row.count,
                              percent: row.percent,
                              base: summary.base,
                              model: "outlink-topic-model",
                              threshold: 0.5,
                              period_start: result.start,
                              period_end: result.observedEnd,
                              observation_mode:
                                session.params.observation?.mode ??
                                "after_event",
                              wikipedia_languages:
                                result.question.wikipedia_languages.join("|"),
                              projects:
                                result.question.projects?.join("|") ??
                                "selected_families",
                              classified_articles: summary.classified,
                              unclassified_articles: summary.unclassified,
                              unavailable_articles: summary.unavailable,
                              pending_articles: summary.pending,
                            })),
                            { escapeFormulae: true },
                          ),
                      ],
                      { type: "text/csv;charset=utf-8" },
                    ),
                    "thematiques-wikipedia.csv",
                  )
                }
              >
                {t("topics.export")}
              </button>
            </>
          ) : (
            <p className="hint">{t("topics.noThemes")}</p>
          )}
        </div>
      )}
    </section>
  );
}

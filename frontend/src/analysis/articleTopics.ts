import type { ArticleTopics, Edit, Session } from "../types";
import type { FollowupResult } from "./followup";

export type ArticleKind = "both" | "creation" | "modification";
export type TopicMetric = "contributors" | "articles" | "edits";
export const articleKey = (edit: Edit) =>
  edit.project +
  (edit.page_id
    ? ":id:" + edit.page_id
    : ":title:" + edit.title.replaceAll("_", " "));

export function articleEdits(result: FollowupResult, session: Session) {
  const wikis = new Set(
    session.catalog.filter((p) => p.family === "wikipedia").map((p) => p.id),
  );
  const seen = new Set<string>();
  return result.rows
    .filter((row) => row.included)
    .flatMap((row) => row.edits)
    .filter((edit) => {
      const key = edit.project + ":" + edit.revision;
      if (
        !wikis.has(edit.project) ||
        edit.namespace !== 0 ||
        !edit.title ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    });
}

export function creationType(
  edit: Edit,
  metadata?: ArticleTopics,
): boolean | null {
  if (typeof edit.new_page === "boolean") return edit.new_page;
  return metadata?.first_revision && edit.revision >= metadata.first_revision
    ? edit.revision === metadata.first_revision
    : null;
}

export function topicGroup(topic: string) {
  const value = topic.toLowerCase().replaceAll(" ", "_");
  if (value.startsWith("geography.")) return "geography";
  if (value.startsWith("stem.")) return "science";
  if (value.startsWith("culture.biography.")) return "biographies";
  if (value.startsWith("culture.")) return "culture";
  if (/\.(history|military_and_warfare)$/.test(value)) return "history";
  if (value.endsWith(".sports")) return "sport";
  if (value.endsWith(".philosophy_and_religion")) return "philosophy";
  if (value.startsWith("history_and_society.")) return "society";
  return "other";
}

export function summarizeArticles(
  edits: Edit[],
  cache: Record<string, ArticleTopics>,
  kind: ArticleKind,
  metric: TopicMetric,
  detailed = false,
) {
  const eligible = edits.filter(
    (e) => cache[articleKey(e)]?.status !== "excluded",
  );
  const selected = eligible.filter(
    (e) =>
      kind === "both" ||
      creationType(e, cache[articleKey(e)]) === (kind === "creation"),
  );
  const identity = (e: Edit) => {
    const m = cache[articleKey(e)];
    return m?.page_id ? e.project + ":id:" + m.page_id : articleKey(e);
  };
  const unitKey = (e: Edit) =>
    metric === "contributors"
      ? e.username
      : metric === "articles"
        ? identity(e)
        : e.project + ":" + e.revision;
  const base = new Set(selected.map(unitKey)).size;
  const sets = new Map<string, Set<string>>();
  const classified = new Set<string>(),
    unclassified = new Set<string>(),
    unavailable = new Set<string>(),
    pending = new Set<string>();
  for (const edit of selected) {
    const metadata = cache[articleKey(edit)];
    const article = identity(edit);
    if (!metadata) pending.add(article);
    else if (metadata.status === "unavailable") unavailable.add(article);
    else if (
      metadata.status === "unclassified" ||
      !metadata.topics.some((t) => t.score >= 0.5)
    )
      unclassified.add(article);
    else {
      classified.add(article);
      const topics = metadata.topics
        .filter((t) => t.score >= 0.5)
        .map((t) => t.topic);
      // Do not mix general parent labels with specific labels in the detail view.
      const labels = detailed
        ? topics.filter((t) => !t.endsWith("*"))
        : topics.map(topicGroup);
      for (const label of new Set(labels)) {
        const values = sets.get(label) ?? new Set<string>();
        values.add(unitKey(edit));
        sets.set(label, values);
      }
    }
  }
  const rows = [...sets]
    .map(([topic, values]) => ({
      topic,
      count: values.size,
      percent: base ? (values.size / base) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  return {
    eligible,
    selected,
    rows,
    base,
    contributors: new Set(selected.map((e) => e.username)).size,
    articles: new Set(selected.map(identity)).size,
    creations: eligible.filter(
      (e) => creationType(e, cache[articleKey(e)]) === true,
    ).length,
    modifications: eligible.filter(
      (e) => creationType(e, cache[articleKey(e)]) === false,
    ).length,
    unknownType: eligible.filter(
      (e) => creationType(e, cache[articleKey(e)]) === null,
    ).length,
    classified: classified.size,
    unclassified: unclassified.size,
    unavailable: unavailable.size,
    pending: pending.size,
    excluded: new Set(
      edits
        .filter((e) => cache[articleKey(e)]?.status === "excluded")
        .map(identity),
    ).size,
  };
}

import { defaultQuestion, today, type Session, type Project } from "../types";
import { dateMs, DAY, segment, selected, signature } from "./cohorts";
import { isMessage } from "../i18n";

export const wikipediaLanguage = (project: Project) =>
  project.domain.split(".")[0];
export function includesDeleted(
  edit: Session["edits"][number],
  q: Session["question"],
) {
  if (!edit.deleted_page) return true;
  const creations = q?.include_deleted_creations !== false;
  const modifications = q?.include_deleted_modifications !== false;
  return edit.new_page === true
    ? creations
    : edit.new_page === false
      ? modifications
      : creations || modifications;
}
export function analyzeFollowup(s: Session) {
  const q = {
    ...defaultQuestion(),
    ...s.question,
    include_deleted_creations: s.question?.include_deleted_creations !== false,
    include_deleted_modifications:
      s.question?.include_deleted_modifications !== false,
  };
  const observation = s.params.observation;
  const startMs = observation
    ? dateMs(
        observation.mode === "period"
          ? observation.start
          : (s.new_accounts?.start ?? s.params.start),
      )
    : dateMs(s.params.end) + DAY;
  const reference = dateMs(s.params.reference);
  const deadline = observation
    ? dateMs(observation.end)
    : q.days === "today"
      ? dateMs(today())
      : dateMs(s.params.end) + q.days * DAY;
  const valid =
    (q.days === "today" ||
      (Number.isInteger(q.days) && q.days >= 1 && q.days <= 36500)) &&
    Number.isFinite(startMs) &&
    Number.isFinite(reference) &&
    deadline >= startMs;
  const reached = valid && deadline <= reference;
  const observedEnd = Math.min(deadline, reference);
  const projects = s.catalog.filter(
    (project) =>
      (!q.projects || q.projects.includes(project.id)) &&
      (q.families.includes("*") || q.families.includes(project.family)) &&
      (project.family !== "wikipedia" ||
        q.wikipedia_languages.includes("*") ||
        q.wikipedia_languages.includes(wikipediaLanguage(project))),
  );
  const projectIds = new Set(projects.map((project) => project.id));
  const enabled = projects.some(
    (project) =>
      project.family !== "wikipedia" || q.wikipedia_categories.length > 0,
  );
  const collected = new Set(
    s.params.scope === "origin" ? s.params.origins : s.params.projects,
  );
  const scopeCovered =
    s.params.scope === "all" ||
    projects.every((project) => collected.has(project.id));
  const sameScope = s.collection_signature === signature(s.params);
  const catalog = new Map(s.catalog.map((project) => [project.id, project]));
  const buckets = new Map<string, Session["edits"]>();
  for (const edit of s.edits) {
    const bucket = buckets.get(edit.username) ?? [];
    bucket.push(edit);
    buckets.set(edit.username, bucket);
  }
  const rows = s.cohort.map((account) => {
    const all = buckets.get(account.username) ?? [];
    const included = selected(
      account,
      segment(
        { ...account, pre_complete: account.pre_complete && sameScope },
        all,
        s.params,
      ),
      s.params,
    );
    const edits = valid
      ? all
          .filter((edit) => {
            const project = catalog.get(edit.project);
            const day = dateMs(edit.timestamp);
            const afterSignup =
              !observation ||
              observation.mode !== "registration" ||
              Date.parse(edit.timestamp) >=
                Date.parse(
                  account.signup?.timestamp ?? account.registration ?? "",
                );
            return (
              project &&
              projectIds.has(edit.project) &&
              afterSignup &&
              day >= startMs &&
              day <= observedEnd &&
              (project.family !== "wikipedia" ||
                q.wikipedia_categories.includes(edit.category)) &&
              (!s.params.exclude_automation ||
                !["bot", "detected"].includes(edit.automation))
            );
          })
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      : [];
    const selectedEdits = edits.filter((edit) => includesDeleted(edit, q));
    const deletedNeeded =
      projects.some((project) => project.family === "wikipedia") &&
      q.wikipedia_categories.includes("CONTENT") &&
      (q.include_deleted_creations !== false ||
        q.include_deleted_modifications !== false);
    const deletedCovered =
      !deletedNeeded ||
      !s.deleted_collection_version ||
      (account.deleted_complete === true &&
        ((q.include_deleted_creations !== false &&
          q.include_deleted_modifications !== false) ||
          account.deleted_classified === true));
    const complete =
      valid &&
      enabled &&
      reached &&
      scopeCovered &&
      sameScope &&
      account.post_complete &&
      account.exists === true &&
      deletedCovered;
    const outcome = selectedEdits.length
      ? "contributing"
      : complete
        ? "not_contributing"
        : "unknown";
    return {
      account,
      included,
      edits: selectedEdits,
      deletedEdits: edits.filter((edit) => edit.deleted_page),
      deletedCovered,
      complete,
      outcome,
      last: selectedEdits.at(-1)?.timestamp ?? null,
      projects: [...new Set(selectedEdits.map((edit) => edit.project))],
    };
  });
  const included = rows.filter((row) => row.included);
  const incompleteAccounts = sameScope
    ? included.filter(
        (row) => !row.account.post_complete || row.account.exists !== true,
      )
    : [];
  const collection = {
    current: sameScope,
    completed: sameScope
      ? included.filter(
          (row) => row.account.post_complete && row.account.exists === true,
        ).length
      : 0,
    unverified: incompleteAccounts.filter(
      (row) => !row.account.qualified || row.account.exists !== true,
    ),
    unavailable: incompleteAccounts.filter(
      (row) =>
        row.account.qualified &&
        row.account.exists === true &&
        ["failed", "partial"].includes(row.account.technical) &&
        (!row.account.warnings.length ||
          !row.account.warnings.every((warning) =>
            isMessage(warning, "collectionNamespaceUnavailable"),
          )),
    ),
    classification: incompleteAccounts.filter(
      (row) =>
        row.account.qualified &&
        row.account.exists === true &&
        row.account.warnings.length > 0 &&
        row.account.warnings.every((warning) =>
          isMessage(warning, "collectionNamespaceUnavailable"),
        ),
    ),
    unfinished: incompleteAccounts.filter(
      (row) =>
        row.account.qualified &&
        row.account.exists === true &&
        !["failed", "partial"].includes(row.account.technical),
    ),
  };
  const active = included.filter(
    (row) => row.outcome === "contributing",
  ).length;
  const inactive = included.filter(
    (row) => row.outcome === "not_contributing",
  ).length;
  const unknown = included.length - active - inactive;
  const complete =
    reached &&
    enabled &&
    scopeCovered &&
    included.length > 0 &&
    included.every((row) => row.complete);
  const families = [
    ...new Set(projects.map((project) => project.family)),
  ].sort();
  const byFamily = families.map((family) => {
    const contributors = included.filter((row) =>
      row.edits.some((edit) => catalog.get(edit.project)?.family === family),
    );
    const edits = contributors.reduce(
      (sum, row) =>
        sum +
        row.edits.filter((edit) => catalog.get(edit.project)?.family === family)
          .length,
      0,
    );
    return {
      family,
      active: contributors.length,
      inactive: included.filter(
        (row) =>
          row.complete &&
          !row.edits.some(
            (edit) => catalog.get(edit.project)?.family === family,
          ),
      ).length,
      unknown: included.filter(
        (row) =>
          !row.complete &&
          !row.edits.some(
            (edit) => catalog.get(edit.project)?.family === family,
          ),
      ).length,
      edits,
      percent: included.length
        ? (contributors.length / included.length) * 100
        : null,
    };
  });
  return {
    question: q,
    valid,
    enabled,
    reached,
    future: valid && deadline > dateMs(today()),
    scopeCovered,
    collection,
    start: valid ? new Date(startMs).toISOString().slice(0, 10) : null,
    end: valid ? new Date(deadline).toISOString().slice(0, 10) : null,
    observedEnd: valid
      ? new Date(observedEnd).toISOString().slice(0, 10)
      : null,
    rows,
    included,
    n: included.length,
    active,
    inactive,
    unknown,
    complete,
    rate: complete ? (active / included.length) * 100 : null,
    totalEdits: included.reduce((sum, row) => sum + row.edits.length, 0),
    byFamily,
    projects,
    deleted: {
      collected: s.deleted_collection_version === 1 && sameScope,
      incomplete: included
        .filter((row) => row.account.deleted_complete !== true)
        .map((row) => row.account.username),
      unclassified: included
        .filter((row) => row.account.deleted_classified !== true)
        .map((row) => row.account.username),
      creations: included.reduce(
        (sum, row) =>
          sum + row.deletedEdits.filter((e) => e.new_page === true).length,
        0,
      ),
      modifications: included.reduce(
        (sum, row) =>
          sum + row.deletedEdits.filter((e) => e.new_page === false).length,
        0,
      ),
      unknown: included.reduce(
        (sum, row) =>
          sum + row.deletedEdits.filter((e) => e.new_page == null).length,
        0,
      ),
    },
  };
}
export type FollowupResult = ReturnType<typeof analyzeFollowup>;

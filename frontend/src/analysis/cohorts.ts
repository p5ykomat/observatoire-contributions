import type { Account, Edit, Params, Segment } from "../types";
export const DAY = 86400000;
export const dateMs = (date: string) =>
  Date.parse(date.slice(0, 10) + "T00:00:00Z");
export function creationWindow(p: Params): { start: string; end: string } {
  if (p.creation_range) return p.creation_range;
  const start = dateMs(p.start);
  if (!Number.isFinite(start)) return { start: "", end: "" };
  return {
    start: new Date(start - p.creation_before * DAY).toISOString().slice(0, 10),
    end: new Date(start + p.creation_after * DAY).toISOString().slice(0, 10),
  };
}
export function segment(account: Account, edits: Edit[], p: Params): Segment {
  if (!account.registration || account.exists !== true) return "unknown";
  const created = dateMs(account.registration),
    start = dateMs(p.start),
    window = creationWindow(p);
  if (
    window.start <= window.end &&
    created >= dateMs(window.start) &&
    created <= dateMs(window.end)
  )
    return "new";
  if (created >= start || !account.pre_complete) return "unknown";
  const before = edits.filter(
    (e) =>
      dateMs(e.timestamp) >= start - p.pre_days * DAY &&
      dateMs(e.timestamp) < start,
  ).length;
  return before <= p.pre_threshold ? "reactivated" : "active";
}
export function selected(a: Account, group: Segment, p: Params): boolean {
  if (!a.included) return false;
  if (p.creation_restriction && group !== "new") return false;
  return p.selection === "new"
    ? group === "new"
    : p.selection === "new_reactivated"
      ? ["new", "reactivated"].includes(group)
      : true;
}
export function signature(p: Params) {
  return JSON.stringify([
    p.start,
    p.end,
    p.reference,
    p.pre_days,
    p.scope,
    p.projects,
    p.origins,
    ...(p.observation ? [p.observation] : []),
  ]);
}

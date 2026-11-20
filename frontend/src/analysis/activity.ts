import type { Edit, Session } from "../types";
import type { FollowupResult } from "./followup";
import { dateMs, DAY } from "./cohorts";
import { contributionsURL } from "./contributionLinks";

export function projectActivity(edits: Edit[], catalog: Session["catalog"]) {
  const grouped = new Map<
    string,
    {
      project: string;
      domain: string;
      family: string;
      count: number;
      names: Set<string>;
    }
  >();
  const projects = new Map(catalog.map((p) => [p.id, p]));
  for (const edit of edits) {
    const p = projects.get(edit.project);
    const row = grouped.get(edit.project) ?? {
      project: edit.project,
      domain: p?.domain ?? edit.project,
      family: p?.family ?? "other",
      count: 0,
      names: new Set<string>(),
    };
    row.count++;
    row.names.add(edit.username);
    grouped.set(edit.project, row);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      contributors: row.names.size,
      percent: edits.length ? (row.count / edits.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

export function contributionURL(edit: Edit, catalog: Session["catalog"]) {
  const project = catalog.find((p) => p.id === edit.project);
  if (!project || !contributionsURL(project, edit.username)) return null;
  return edit.deleted_page
    ? `https://${project.domain}/w/index.php?title=Special:Log&type=delete&page=${encodeURIComponent(edit.title)}`
    : `https://${project.domain}/w/index.php?diff=${edit.revision}`;
}

export function activityDays(edits: Edit[]) {
  const days = new Map<string, Edit[]>();
  for (const edit of edits) {
    const day = new Date(edit.timestamp).toISOString().slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(edit);
    days.set(day, list);
  }
  return days;
}

export function weekdayActivity(edits: Edit[], start: string, end: string) {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    days: 0,
    count: 0,
    names: new Set<string>(),
  }));
  for (
    let day = dateMs(start), last = dateMs(end);
    Number.isFinite(day) && day <= last;
    day += DAY
  )
    rows[(new Date(day).getUTCDay() + 6) % 7].days++;
  for (const edit of edits) {
    const day = new Date(edit.timestamp).toISOString().slice(0, 10);
    if (day < start || day > end) continue;
    const row = rows[(new Date(edit.timestamp).getUTCDay() + 6) % 7];
    row.count++;
    row.names.add(edit.username);
  }
  return rows.map((row) => ({
    ...row,
    contributors: row.names.size,
    average: row.days ? row.count / row.days : 0,
  }));
}

export const observedContributions = (result: FollowupResult) =>
  result.included.flatMap((row) => row.edits);

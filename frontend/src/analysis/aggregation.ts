import { CATEGORIES, type Account, type Edit, type Session } from "../types";
import { dateMs, DAY, segment, selected, signature } from "./cohorts";
import { temporal, HORIZONS } from "./retention";
export function summarizeAccount(account: Account, all: Edit[], s: Session) {
  const p = s.params,
    begin = dateMs(p.start),
    end = dateMs(p.end),
    ref = dateMs(p.reference);
  const scope = p.scope === "origin" ? p.origins : p.projects;
  const eligible = all.filter(
    (e) =>
      p.categories.includes(e.category) &&
      (!p.exclude_automation || !["bot", "detected"].includes(e.automation)),
  );
  const post = eligible
    .filter(
      (e) =>
        dateMs(e.timestamp) > end &&
        dateMs(e.timestamp) <= ref &&
        (p.scope === "all" || scope.includes(e.project)),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const before = all.filter(
    (e) =>
      dateMs(e.timestamp) >= begin - p.pre_days * DAY &&
      dateMs(e.timestamp) < begin,
  ).length;
  const during = all.filter(
    (e) => dateMs(e.timestamp) >= begin && dateMs(e.timestamp) <= end,
  ).length;
  const group = segment(
      {
        ...account,
        pre_complete:
          account.pre_complete && s.collection_signature === signature(p),
      },
      all,
      p,
    ),
    periods = temporal(post, p);
  const byProject: Record<string, number> = Object.create(null),
    byMonth: Record<string, number> = Object.create(null),
    byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
      (typeof CATEGORIES)[number],
      number
    >;
  post.forEach((e) => {
    byProject[e.project] = (byProject[e.project] ?? 0) + 1;
    byMonth[e.timestamp.slice(0, 7)] =
      (byMonth[e.timestamp.slice(0, 7)] ?? 0) + 1;
    byCategory[e.category]++;
  });
  const origin = post.filter((e) => p.origins.includes(e.project)).length;
  const complete =
    account.post_complete && s.collection_signature === signature(p);
  const migration = !complete
    ? "unknown"
    : !post.length
      ? "none"
      : origin === post.length
        ? "origin"
        : origin
          ? "both"
          : "other";
  return {
    account,
    group,
    included: selected(account, group, p),
    before,
    during,
    total: post.length,
    first: post[0]?.timestamp ?? null,
    last: post.at(-1)?.timestamp ?? null,
    delay: post.length
      ? Math.floor((dateMs(post[0].timestamp) - end) / DAY)
      : null,
    active_months: Object.keys(byMonth).length,
    distinct_projects: Object.keys(byProject).length,
    distinct_categories: Object.values(byCategory).filter(Boolean).length,
    origin_edits: origin,
    other_edits: post.length - origin,
    active30: post.some((e) => dateMs(e.timestamp) >= ref - 29 * DAY),
    active90: post.some((e) => dateMs(e.timestamp) >= ref - 89 * DAY),
    periods,
    byProject,
    byMonth,
    byCategory,
    migration,
    complete,
    post,
  };
}
export function aggregate(s: Session) {
  const buckets = new Map<string, Edit[]>();
  s.edits.forEach((e) => {
    const bucket = buckets.get(e.username) ?? [];
    bucket.push(e);
    buckets.set(e.username, bucket);
  });
  const rows = s.cohort.map((a) =>
    summarizeAccount(a, buckets.get(a.username) ?? [], s),
  );
  const included = rows.filter((r) => r.included);
  const n = included.length;
  const complete = n > 0 && included.every((r) => r.complete);
  const periods = HORIZONS.map((h, i) => {
    const available =
      dateMs(s.params.reference) - dateMs(s.params.end) >= h * DAY;
    const active = included.filter((r) => r.periods[i].period).length;
    const cumulative = included.filter((r) => r.periods[i].cumulative).length;
    return {
      horizon: h,
      start: i ? HORIZONS[i - 1] + 1 : 1,
      available,
      active,
      cumulative,
      rate: available && complete ? (active / n) * 100 : null,
      cumulative_rate: available && complete ? (cumulative / n) * 100 : null,
    };
  });
  const byProject: Record<string, number> = Object.create(null),
    byMonth: Record<string, number> = Object.create(null),
    byCategory: Record<string, number> = Object.create(null),
    migration: Record<string, number> = {
      origin: 0,
      both: 0,
      other: 0,
      none: 0,
      unknown: 0,
    },
    groups: Record<string, { total: number; active: number; edits: number }> =
      {};
  included.forEach((r) => {
    for (const [name, values] of [
      ["project", r.byProject],
      ["month", r.byMonth],
      ["category", r.byCategory],
    ] as const) {
      const output =
        name === "project"
          ? byProject
          : name === "month"
            ? byMonth
            : byCategory;
      Object.entries(values).forEach(
        ([k, v]) => (output[k] = (output[k] ?? 0) + v),
      );
    }
    migration[r.migration]++;
    const g = groups[r.group] ?? { total: 0, active: 0, edits: 0 };
    g.total++;
    g.active += Number(r.total > 0);
    g.edits += r.total;
    groups[r.group] = g;
  });
  if (complete) {
    const month = new Date(dateMs(s.params.end) + DAY);
    month.setUTCDate(1);
    const reference = dateMs(s.params.reference);
    while (month.getTime() <= reference) {
      const key = month.toISOString().slice(0, 7);
      byMonth[key] ??= 0;
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
  const matrix = s.params.origins.flatMap((origin) =>
    Object.keys(byProject).map((destination) => ({
      origin,
      destination,
      count: included.filter((r) => r.byProject[destination] > 0).length,
    })),
  );
  return {
    rows,
    included,
    n,
    complete,
    periods,
    byProject,
    byMonth,
    byCategory,
    migration,
    groups,
    matrix,
    totalEdits: included.reduce((n, r) => n + r.total, 0),
    active30: included.filter((r) => r.active30).length,
    active90: included.filter((r) => r.active90).length,
    today_active: included.filter((r) => r.total > 0).length,
  };
}
export type Results = ReturnType<typeof aggregate>;
export type AccountResult = Results["rows"][number];

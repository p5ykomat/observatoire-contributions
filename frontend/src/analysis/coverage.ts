import type { Params, Session } from "../types";
import { dateMs, DAY } from "./cohorts";

// Older archives stored these same fields in the collection signature.
export function collectedParams(s: Session): Params | null {
  if (s.collection_params) return s.collection_params;
  try {
    const v = JSON.parse(s.collection_signature ?? "null");
    if (
      !Array.isArray(v) ||
      v.length < 7 ||
      !v.slice(0, 3).every((x: unknown) => typeof x === "string") ||
      !Number.isFinite(v[3]) ||
      !["all", "origin", "custom"].includes(v[4]) ||
      !Array.isArray(v[5]) ||
      !Array.isArray(v[6])
    )
      return null;
    return {
      ...s.params,
      start: v[0],
      end: v[1],
      reference: v[2],
      pre_days: v[3],
      scope: v[4],
      projects: v[5],
      origins: v[6],
      observation: v[7],
    };
  } catch {
    return null;
  }
}

export function collectionBounds(s: Session) {
  const p = collectedParams(s);
  const start = p
    ? p.observation
      ? dateMs(
          p.observation.mode === "period"
            ? p.observation.start
            : (s.new_accounts?.start ?? p.start),
        )
      : dateMs(p.start) - p.pre_days * DAY
    : NaN;
  return { params: p, start, end: p ? dateMs(p.reference) : NaN };
}

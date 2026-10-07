import { dateMs, DAY } from "./cohorts";
import type { Edit, Params } from "../types";
export const HORIZONS = [30, 90, 180, 365, 730, 1095];
export function temporal(edits: Edit[], p: Params) {
  const end = dateMs(p.end),
    reference = dateMs(p.reference);
  const days = Math.floor((reference - end) / DAY);
  const offsets = edits
    .map((e) => Math.floor((dateMs(e.timestamp) - end) / DAY))
    .filter((d) => d > 0 && d <= days);
  return HORIZONS.map((h, i) => ({
    horizon: h,
    start: i ? HORIZONS[i - 1] + 1 : 1,
    available: days >= h,
    cumulative: offsets.some((d) => d <= h),
    period: offsets.some((d) => d >= (i ? HORIZONS[i - 1] + 1 : 1) && d <= h),
  }));
}

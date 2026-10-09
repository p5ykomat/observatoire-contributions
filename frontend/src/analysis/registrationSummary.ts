import i18n from "../i18n";
import type { Session } from "../types";
import { analyzeFollowup } from "./followup";

export function registrationSummary(s: Session): string {
  if (!s.new_accounts || !s.params.observation) return "";
  const r = analyzeFollowup(s),
    o = s.params.observation;
  const fmt = (value: number) =>
    value.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
  const period =
    o.mode === "registration"
      ? i18n.t("newAccounts.reportSince", { end: o.end })
      : i18n.t("newAccounts.reportPeriod", { start: o.start, end: o.end });
  const projects = r.byFamily
    .filter((f) => f.active > 0)
    .map((f) =>
      i18n.t("newAccounts.reportProject", {
        project: i18n.t("fup.families." + f.family, { defaultValue: f.family }),
        count: f.active,
        rate: fmt(f.percent ?? 0),
      }),
    )
    .join(" ; ");
  return (
    i18n.t(r.complete ? "newAccounts.report" : "newAccounts.reportPartial", {
      total: r.n,
      start: s.new_accounts.start,
      end: s.new_accounts.end,
      active: r.active,
      rate: fmt(r.n ? (100 * r.active) / r.n : 0),
      period,
      edits: r.totalEdits,
      unknown: r.unknown,
    }) +
    (projects ? " " + i18n.t("newAccounts.reportProjects", { projects }) : "")
  );
}

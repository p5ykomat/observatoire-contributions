import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Edit, Project } from "../types";
import {
  activityDays,
  projectActivity,
  contributionURL,
  weekdayActivity,
} from "../analysis/activity";
import { dateMs } from "../analysis/cohorts";

interface CalendarProps {
  edits: Edit[];
  start: string;
  end: string;
  complete: boolean;
  catalog: Project[];
  observedEnd: string;
}
export function ContributionCalendar(
  props: CalendarProps & { individual?: boolean },
) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="contribution-calendar"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {t(props.individual ? "calendar.individual" : "calendar.title")}
      </summary>
      {open && <CalendarBody {...props} />}
    </details>
  );
}

function CalendarBody({
  edits,
  start,
  end,
  complete,
  catalog,
  observedEnd,
}: CalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "fr";
  const [selectedYear, setYear] = useState(end.slice(0, 4)),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(0);
  const valid =
    Number.isFinite(dateMs(start)) &&
    Number.isFinite(dateMs(end)) &&
    start <= end;
  const first = Number(start.slice(0, 4)),
    last = Number(end.slice(0, 4));
  const years = valid
    ? Array.from({ length: Math.min(101, last - first + 1) }, (_, i) =>
        String(first + i),
      )
    : [];
  const year = years.includes(selectedYear) ? selectedYear : end.slice(0, 4);
  const days = useMemo(() => activityDays(edits), [edits]);
  const weekdays = useMemo(
    () => weekdayActivity(edits, start, observedEnd),
    [edits, start, observedEnd],
  );
  const peak = Math.max(0, ...[...days.values()].map((list) => list.length));
  const limits =
    peak > 40 ? [1, Math.ceil(peak / 4), Math.ceil(peak / 2)] : [1, 4, 9];
  const level = (n: number) =>
    !n ? 0 : n <= limits[0] ? 1 : n <= limits[1] ? 2 : n <= limits[2] ? 3 : 4;
  const fmt = (n: number) =>
    n > 0 && n < 0.1
      ? "<" + (0.1).toLocaleString(locale)
      : n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const fullDate = (day: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(day + "T00:00:00Z"));
  const weekday = (i: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 0, 5 + i)));
  const chosen = selected >= start && selected <= end ? selected : "";
  const dayEdits = days.get(chosen) ?? [];
  const dayProjects = projectActivity(dayEdits, catalog);
  const pages = Math.max(1, Math.ceil(dayEdits.length / 50)),
    current = Math.min(page, pages - 1);
  const maxWeek = Math.max(...weekdays.map((row) => row.count)) || 1;
  const weekdayTotal = weekdays.reduce((sum, row) => sum + row.count, 0);
  const share = (count: number) =>
    fmt(weekdayTotal ? (count / weekdayTotal) * 100 : 0) + " %";
  if (!valid) return <p>{t("fup.invalid")}</p>;
  return (
    <div className="calendar-content">
      <p>{t("calendar.help", { start, end })}</p>
      {!complete && <p className="notice">{t("calendar.partial")}</p>}
      {years.length > 1 && (
        <label>
          {t("calendar.year")}
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      )}
      <ul className="calendar-legend" aria-label={t("calendar.legend")}>
        {[
          "0",
          "1",
          `2-${limits[1]}`,
          `${limits[1] + 1}-${limits[2]}`,
          `${limits[2] + 1}+`,
        ].map((label, i) => (
          <li key={i}>
            <span className={`calendar-swatch heat-${i}`} aria-hidden="true" />
            {label}{" "}
            {i === 1
              ? t("calendar.oneContribution")
              : t("contributions").toLocaleLowerCase(locale)}
          </li>
        ))}
      </ul>
      <p className="hint">{t("calendar.legendHelp")}</p>
      <div className="calendar-months">
        {Array.from({ length: 12 }, (_, month) => {
          const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
          const dayCount = new Date(
            Date.UTC(Number(year), month + 1, 0),
          ).getUTCDate();
          const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${dayCount}`;
          if (monthEnd < start || monthStart > end) return null;
          const leading =
            (new Date(monthStart + "T00:00:00Z").getUTCDay() + 6) % 7;
          return (
            <div
              className="calendar-month"
              key={month}
              aria-label={new Intl.DateTimeFormat(locale, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(monthStart + "T00:00:00Z"))}
            >
              <h4>
                {new Intl.DateTimeFormat(locale, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(monthStart + "T00:00:00Z"))}
              </h4>
              <div className="calendar-grid">
                {Array.from({ length: 7 }, (_, i) => (
                  <span
                    className="calendar-weekday"
                    key={`w${i}`}
                    title={weekday(i)}
                  >
                    {weekday(i).slice(0, 2)}
                  </span>
                ))}
                {Array.from({ length: leading }, (_, i) => (
                  <span key={`blank${i}`} aria-hidden="true" />
                ))}
                {Array.from({ length: dayCount }, (_, i) => {
                  const day = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                  if (day < start || day > end)
                    return (
                      <span
                        className="calendar-outside"
                        key={day}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                    );
                  const count = days.get(day)?.length ?? 0,
                    known = complete && day <= observedEnd;
                  const label = t(
                    known ? "calendar.day" : "calendar.dayPartial",
                    { date: fullDate(day), count },
                  );
                  return (
                    <button
                      key={day}
                      className={`calendar-day heat-${level(count)}${known ? "" : " calendar-incomplete"}`}
                      aria-label={label}
                      title={label}
                      aria-pressed={chosen === day}
                      onClick={() => {
                        setSelected(day);
                        setPage(0);
                      }}
                    >
                      {i + 1}
                      <small>{count ? fmt(count) : known ? "0" : "?"}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {chosen && (
        <section
          className="calendar-day-detail"
          aria-label={t("calendar.detail")}
        >
          <h4>{fullDate(chosen)}</h4>
          <p>
            {t("calendar.daySummary", {
              count: dayEdits.length,
              accounts: new Set(dayEdits.map((e) => e.username)).size,
            })}
          </p>
          <p>
            {dayProjects
              .map((p) => `${p.domain} : ${fmt(p.count)}`)
              .join(" ; ")}
          </p>
          {!complete && <p className="hint">{t("calendar.partial")}</p>}
          {dayEdits.length > 0 && (
            <>
              <table>
                <caption>{t("calendar.detail")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("username")}</th>
                    <th scope="col">{t("activity.project")}</th>
                    <th scope="col">{t("activity.page")}</th>
                    <th scope="col">{t("activity.link")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayEdits.slice(current * 50, current * 50 + 50).map((e) => {
                    const url = contributionURL(e, catalog);
                    return (
                      <tr key={e.project + ":" + e.revision}>
                        <th scope="row">{e.username}</th>
                        <td>
                          {catalog.find((p) => p.id === e.project)?.domain ??
                            e.project}
                        </td>
                        <td>{e.title}</td>
                        <td>
                          {url && (
                            <a href={url} target="_blank" rel="noreferrer">
                              {t(
                                e.deleted_page
                                  ? "activity.deletionLink"
                                  : "activity.link",
                              )}
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="actions">
                <button
                  disabled={!current}
                  onClick={() => setPage(current - 1)}
                >
                  {t("previous")}
                </button>
                <span>{t("page", { page: current + 1, total: pages })}</span>
                <button
                  disabled={current + 1 >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  {t("next")}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <h3>{t("calendar.weekTitle")}</h3>
      <p className="hint">{t("calendar.weekHelp")}</p>
      <ol className="weekday-bars" aria-label={t("calendar.weekTitle")}>
        {weekdays.map((row) => (
          <li key={row.day}>
            <span>{weekday(row.day)}</span>
            <span className="weekday-track" aria-hidden="true">
              <span
                style={{
                  width: `${(row.count / maxWeek) * 100}%`,
                }}
              />
            </span>
            <strong>
              {fmt(row.count)} ({share(row.count)})
            </strong>
          </li>
        ))}
      </ol>
      <table>
        <caption>{t("calendar.weekDetails")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("calendar.weekday")}</th>
            <th scope="col">{t("contributions")}</th>
            <th scope="col">{t("calendar.accounts")}</th>
            <th scope="col">{t("activity.share")}</th>
          </tr>
        </thead>
        <tbody>
          {weekdays.map((row) => (
            <tr key={row.day}>
              <th scope="row">{weekday(row.day)}</th>
              <td>{fmt(row.count)}</td>
              <td>{fmt(row.contributors)}</td>
              <td>{share(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

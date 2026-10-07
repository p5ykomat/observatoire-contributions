import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountResult } from "../analysis/aggregation";
import { CATEGORIES } from "../types";
interface Column {
  key: string;
  label: string;
  value: (r: AccountResult) => string | number;
}
export function ParticipantTable({
  rows,
  toggle,
  detail,
}: {
  rows: AccountResult[];
  toggle: (name: string) => void;
  detail: (r: AccountResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState(""),
    [technical, setTechnical] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState("username"),
    [desc, setDesc] = useState(false),
    [visible, setVisible] = useState(["username", "post", "last", "status"]);
  const columns: Column[] = [
    { key: "username", label: t("username"), value: (r) => r.account.username },
    {
      key: "registration",
      label: t("registration"),
      value: (r) => r.account.registration ?? t("unknown"),
    },
    { key: "pre", label: t("pre"), value: (r) => r.before },
    { key: "during", label: t("during"), value: (r) => r.during },
    { key: "post", label: t("post"), value: (r) => r.total },
    { key: "first", label: t("first"), value: (r) => r.first ?? "" },
    { key: "last", label: t("last"), value: (r) => r.last ?? "" },
    { key: "delay", label: t("delay"), value: (r) => r.delay ?? "" },
    { key: "months", label: t("months"), value: (r) => r.active_months },
    {
      key: "distinct",
      label: t("distinct"),
      value: (r) => r.distinct_projects,
    },
    {
      key: "providers",
      label: t("providers"),
      value: (r) => r.account.providers.join(", "),
    },
    {
      key: "status",
      label: t("status"),
      value: (r) => t("technical." + r.account.technical),
    },
    ...CATEGORIES.map((c) => ({
      key: c,
      label: t("category." + c),
      value: (r: AccountResult) => r.byCategory[c],
    })),
    ...[30, 90, 180, 365, 730, 1095].map((h, i) => ({
      key: "p" + h,
      label: t("periodLabel", {
        start: i ? [30, 90, 180, 365, 730][i - 1] + 1 : 1,
        end: h,
      }),
      value: (r: AccountResult) =>
        !r.periods[i].available
          ? t("unavailable")
          : !r.complete
            ? t("partial")
            : Number(r.periods[i].period),
    })),
  ];
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.account.username
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()) &&
          (!technical || r.account.technical === technical),
      ),
    [rows, search, technical],
  );
  const sortColumn = columns.find((c) => c.key === sort)!;
  const sorted = [...filtered].sort((a, b) => {
    const av = sortColumn.value(a),
      bv = sortColumn.value(b);
    return (
      (typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), i18n.resolvedLanguage, {
            numeric: true,
          })) * (desc ? -1 : 1)
    );
  });
  const total = Math.max(1, Math.ceil(sorted.length / 25));
  const current = Math.min(page, total - 1);
  const chosen = columns.filter((c) => visible.includes(c.key));
  return (
    <section>
      <h2>{t("detail")}</h2>
      <p className="hint">{t("participantTableHelp")}</p>
      <div className="filters">
        <label>
          {t("search")}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          {t("technicalFilter")}
          <select
            value={technical}
            onChange={(e) => setTechnical(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {[
              "pending",
              "running",
              "retrying",
              "completed_primary",
              "completed_fallback",
              "partial",
              "failed",
            ].map((k) => (
              <option key={k} value={k}>
                {t("technical." + k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("sort")}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("direction")}
          <select
            value={String(desc)}
            onChange={(e) => setDesc(e.target.value === "true")}
          >
            <option value="false">{t("ascending")}</option>
            <option value="true">{t("descending")}</option>
          </select>
        </label>
      </div>
      <details>
        <summary>{t("columns")}</summary>
        <div className="checks">
          {columns.map((c) => (
            <label key={c.key}>
              <input
                type="checkbox"
                checked={visible.includes(c.key)}
                onChange={() =>
                  setVisible((v) =>
                    v.includes(c.key)
                      ? v.filter((k) => k !== c.key)
                      : [...v, c.key],
                  )
                }
              />
              {c.label}
            </label>
          ))}
        </div>
      </details>
      <div className="table-scroll">
        <table className="participant-table">
          <caption>{t("detail")}</caption>
          <thead>
            <tr>
              <th>{t("excludeQuestion")}</th>
              {chosen.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(current * 25, current * 25 + 25).map((r) => (
              <tr key={r.account.username}>
                <td data-label={t("excludeQuestion")}>
                  <input
                    type="checkbox"
                    aria-label={t("excludeAccount", {
                      name: r.account.username,
                    })}
                    checked={!r.account.included}
                    onChange={() => toggle(r.account.username)}
                  />
                </td>
                {chosen.map((c) => (
                  <td key={c.key} data-label={c.label}>
                    {c.key === "username" ? (
                      <button className="link" onClick={() => detail(r)}>
                        {r.account.username}
                      </button>
                    ) : (
                      c.value(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          {t("previous")}
        </button>
        <span>{t("page", { page: current + 1, total })}</span>
        <button
          disabled={current + 1 >= total}
          onClick={() => setPage(current + 1)}
        >
          {t("next")}
        </button>
      </div>
    </section>
  );
}

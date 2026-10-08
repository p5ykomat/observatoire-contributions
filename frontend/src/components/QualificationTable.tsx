import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateMs, DAY } from "../analysis/cohorts";
import type { Account } from "../types";
import { translateMessage } from "../i18n";

export function QualificationTable({
  accounts,
  start,
  toggle,
  reason,
  disabled = false,
  pendingExclusions = {},
}: {
  accounts: Account[];
  start: string;
  toggle: (name: string) => void;
  reason: (name: string, value: string) => void;
  disabled?: boolean;
  pendingExclusions?: Record<string, boolean>;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [size, setSize] = useState(25),
    [expanded, setExpanded] = useState(false);
  const filtered = useMemo(
    () =>
      accounts.filter((a) =>
        a.username.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [accounts, search],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  const included = accounts.filter((a) => a.included).length;
  return (
    <section className="panel cohort-panel" aria-label={t("participantList")}>
      <h2>{t("participantList")}</h2>
      <p>
        {t("participantCounts", {
          total: accounts.length,
          included,
          excluded: accounts.length - included,
        })}
      </p>
      <p className="hint">{t("excludeHelp")}</p>
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
          {t("rowsPerPage")}
          <select
            aria-label={t("rowsPerPage")}
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={Math.max(1, accounts.length)}>
              {t("showAllAccounts")}
            </option>
          </select>
        </label>
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {t(expanded ? "collapseDetails" : "expandDetails")}
        </button>
      </div>
      <table className="participant-table qualification-table">
        <caption>{t("participantList")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("username")}</th>
            <th scope="col">{t("registration")}</th>
            <th scope="col">{t("excludeQuestion")}</th>
            <th scope="col">{t("accountDetails")}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(current * size, (current + 1) * size).map((a) => (
            <tr key={a.username}>
              <th scope="row">
                {a.username}
                <div className="account-badges">
                  {[
                    a.staff ? t("staff") : "",
                    a.bot ? t("bot") : "",
                    a.role_conflict ? t("conflict") : "",
                    a.exists === false ? t("missing") : "",
                  ]
                    .filter(Boolean)
                    .map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                </div>
              </th>
              <td data-label={t("registration")}>
                {a.registration?.slice(0, 10) ?? t("unknown")}
              </td>
              <td data-label={t("excludeQuestion")}>
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={pendingExclusions[a.username] ?? !a.included}
                    aria-label={t("excludeAccount", { name: a.username })}
                    onChange={() => toggle(a.username)}
                  />
                  {t("yes")}
                </label>
              </td>
              <td data-label={t("accountDetails")}>
                <details open={expanded}>
                  <summary>{t("accountDetails")}</summary>
                  <dl className="account-details">
                    <div>
                      <dt>{t("age")}</dt>
                      <dd>
                        {a.registration && start
                          ? Math.floor(
                              (dateMs(start) - dateMs(a.registration)) / DAY,
                            )
                          : t("unknown")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("globalEdits")}</dt>
                      <dd>{a.global_editcount ?? t("unknown")}</dd>
                    </div>
                    <div>
                      <dt>{t("qualificationStatus")}</dt>
                      <dd>
                        {[
                          !a.qualified
                            ? a.warnings.length
                              ? t("unqualified")
                              : t("pendingVerification")
                            : t("qualified"),
                          a.locked ? t("locked") : "",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </dd>
                    </div>
                  </dl>
                  <label>
                    {t("reason")}
                    <input
                      disabled={disabled}
                      aria-label={t("reason") + " " + a.username}
                      value={translateMessage(a.exclusion_reason)}
                      onChange={(e) => reason(a.username, e.target.value)}
                    />
                  </label>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!filtered.length && <p>{t("noAccounts")}</p>}
      <div className="actions pagination">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          {t("previous")}
        </button>
        <span>
          {t("page", { page: current + 1, total: pages })} ·{" "}
          {t("accountRange", {
            start: filtered.length ? current * size + 1 : 0,
            end: Math.min(filtered.length, (current + 1) * size),
            total: filtered.length,
          })}
        </span>
        <button
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          {t("next")}
        </button>
      </div>
    </section>
  );
}

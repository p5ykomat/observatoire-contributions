import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account, Params } from "../types";
import { creationWindow, dateMs } from "../analysis/cohorts";
import { translateMessage } from "../i18n";

export function SelectionReview({
  rows,
  params,
}: {
  rows: { account: Account; included: boolean }[];
  params: Params;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, pages - 1);
  const reason = (account: Account) => {
    if (!account.included)
      return account.exclusion_reason
        ? translateMessage(account.exclusion_reason)
        : t("selectionExcluded");
    if (!params.start) return t("selectionNeedsStart");
    if (!account.registration || account.exists !== true)
      return t("selectionNeedsVerification");
    const created = dateMs(account.registration),
      window = creationWindow(params);
    if (!window.start || !window.end || window.start > window.end)
      return t("invalidCreationRange");
    if (created < dateMs(window.start)) return t("selectionCreatedBefore");
    if (created > dateMs(window.end)) return t("selectionCreatedAfter");
    return t("selectionNeedsVerification");
  };
  return (
    <details className="selection-review">
      <summary>{t("selectionReviewTitle")}</summary>
      <p className="hint">{t("selectionReviewHelp")}</p>
      <table className="participant-table">
        <caption>{t("selectionReviewTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("username")}</th>
            <th scope="col">{t("registration")}</th>
            <th scope="col">{t("selectionDecision")}</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .slice(current * 25, (current + 1) * 25)
            .map(({ account, included }) => (
              <tr key={account.username}>
                <th scope="row">{account.username}</th>
                <td data-label={t("registration")}>
                  {account.registration?.slice(0, 10) ?? t("unknown")}
                </td>
                <td data-label={t("selectionDecision")}>
                  <strong>
                    {t(included ? "selectionRetained" : "selectionNotRetained")}
                  </strong>
                  {!included && <div className="hint">{reason(account)}</div>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="actions pagination">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t("previous")}
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </details>
  );
}

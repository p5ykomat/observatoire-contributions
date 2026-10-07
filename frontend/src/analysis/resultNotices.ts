import type { FollowupResult } from "./followup";
import type { Session } from "../types";

export interface ResultNotice {
  key: string;
  values: Record<string, string | number>;
  accounts: string[];
  error: boolean;
}

// A result can be provisional even when all account contributions were retrieved.
// Provider changes alone never produce an error.
export function resultNotices(
  session: Session,
  result: FollowupResult,
): ResultNotice[] {
  if (!result.valid || !result.enabled || !result.n) return [];
  const notices: ResultNotice[] = [];
  const add = (
    key: string,
    values: ResultNotice["values"] = {},
    accounts: string[] = [],
    error = false,
  ) => notices.push({ key: "fup." + key, values, accounts, error });
  if (!result.reached)
    add(result.future ? "futureDeadline" : "notReached", {
      date: result.end!,
      observed: session.params.reference,
    });
  if (!result.scopeCovered) add("missingScope");
  if (!result.collection.current) {
    add("changedCollection");
  } else {
    for (const [reason, rows, error] of [
      ["collectionUnverified", result.collection.unverified, true],
      ["collectionUnavailable", result.collection.unavailable, true],
      ["collectionClassification", result.collection.classification, true],
      ["collectionUnfinished", result.collection.unfinished, false],
    ] as const) {
      if (rows.length)
        add(
          reason,
          { count: rows.length },
          rows.map((row) => row.account.username),
          error,
        );
    }
  }
  return notices;
}

import { api, retry } from "./api";
import type { Account } from "./types";

export const EARLIEST_REGISTRATION = "2006-04-18";
export const PRESET_PROJECTS = [
  "frwiki",
  "enwiki",
  "dewiki",
  "commonswiki",
  "wikidatawiki",
];
export interface Candidate {
  name: string;
  local_id: number | null;
  timestamp: string;
  log_id: number;
}
export interface RegistrationImport {
  start: string;
  end: string;
  action: number;
  cursor: string | null;
  pending: Candidate[];
  nextCursor: string | null;
  accounts: Account[];
  unavailable: number;
  excluded: number;
  complete: boolean;
}
export function registrationImport(
  start: string,
  end: string,
): RegistrationImport {
  return {
    start,
    end,
    action: 0,
    cursor: null,
    pending: [],
    nextCursor: null,
    accounts: [],
    unavailable: 0,
    excluded: 0,
    complete: false,
  };
}
export async function loadRegistrations(
  state: RegistrationImport,
  publish: (s: RegistrationImport) => void,
  signal: AbortSignal,
) {
  const actions = ["create", "create2", "byemail"];
  const emit = () => publish(structuredClone(state));
  const call = <T>(path: string, body: unknown) =>
    retry(
      () => api<T>(path, body, signal),
      () => {},
      signal,
    );
  while (state.action < actions.length) {
    if (signal.aborted) throw new DOMException("", "AbortError");
    if (!state.pending.length) {
      const page = await call<{
        candidates: Candidate[];
        unavailable: number;
        cursor: string | null;
      }>("new-accounts", {
        start: state.start,
        end: state.end,
        action: actions[state.action],
        cursor: state.cursor,
      });
      if (page.cursor && page.cursor === state.cursor)
        throw new Error("pagination");
      state.pending = page.candidates;
      state.nextCursor = page.cursor;
      state.unavailable += page.unavailable;
      emit();
    }
    while (state.pending.length) {
      const batch = state.pending
        .filter(
          (c) => Boolean(c.local_id) === Boolean(state.pending[0].local_id),
        )
        .slice(0, 50);
      const verified = await call<{
        accounts: Partial<Account>[];
        unavailable: string[];
        excluded: number;
      }>("new-accounts/verify", { candidates: batch });
      const seen = new Set(state.accounts.map((a) => a.signup?.local_id));
      for (const remote of verified.accounts) {
        const created = remote.registration!.slice(0, 10);
        if (created < state.start || created > state.end) continue;
        if (seen.has(remote.signup!.local_id)) continue;
        seen.add(remote.signup!.local_id);
        state.accounts.push({
          username: remote.username!,
          registration: remote.registration!,
          groups: [],
          locked: false,
          exists: true,
          bot: false,
          included: !remote.bot,
          exclusion_reason: "",
          roles: [],
          staff: false,
          role_conflict: false,
          technical: "pending",
          warnings: [],
          providers: [],
          qualified: false,
          pre_complete: false,
          post_complete: false,
          ...remote,
        });
      }
      state.unavailable += verified.unavailable.length;
      state.excluded += verified.excluded;
      const processed = new Set(batch.map((c) => c.log_id));
      state.pending = state.pending.filter((c) => !processed.has(c.log_id));
      emit();
    }
    if (state.nextCursor) state.cursor = state.nextCursor;
    else {
      state.action++;
      state.cursor = null;
    }
    state.nextCursor = null;
    emit();
  }
  state.complete = true;
  state.accounts.sort(
    (a, b) =>
      a.registration!.localeCompare(b.registration!) ||
      a.username.localeCompare(b.username),
  );
  emit();
  return state;
}

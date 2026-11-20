import { api, retry } from "./api";
import { importNames } from "./imports";
import i18n from "./i18n";
import type { Account, EventRegistrationSource } from "./types";

export interface EventRegistrationImport {
  url: string;
  event: EventRegistrationSource | null;
  accounts: Account[];
  phase: "participants" | "organizers" | "complete";
  cursor: number | null;
  unavailable: number;
}
interface AccountPage {
  accounts: Pick<
    Account,
    "username" | "global_id" | "staff" | "included" | "roles"
  >[];
  cursor: number | null;
  unavailable: number;
}
export const eventRegistrationImport = (
  url: string,
): EventRegistrationImport => ({
  url,
  event: null,
  accounts: [],
  phase: "participants",
  cursor: null,
  unavailable: 0,
});

export async function loadEventRegistration(
  state: EventRegistrationImport,
  publish: (value: EventRegistrationImport) => void,
  signal: AbortSignal,
) {
  const emit = () => publish({ ...state, accounts: [...state.accounts] });
  if (!state.event) {
    state.event = await retry(
      () =>
        api<EventRegistrationSource>(
          "event-registration",
          { url: state.url },
          signal,
        ),
      () => {},
      signal,
    );
    emit();
  }
  const accounts = new Map(state.accounts.map((a) => [a.global_id!, a]));
  const names = new Map(state.accounts.map((a) => [a.username, a.global_id]));
  while (state.phase !== "complete") {
    signal.throwIfAborted();
    const page = await retry(
      () =>
        api<AccountPage>(
          "event-registration/accounts",
          {
            project: state.event!.project,
            event_id: state.event!.id,
            kind: state.phase,
            cursor: state.cursor,
          },
          signal,
        ),
      () => {},
      signal,
    );
    signal.throwIfAborted();
    if (
      !Array.isArray(page.accounts) ||
      !Number.isInteger(page.unavailable) ||
      page.unavailable < 0 ||
      (page.cursor !== null &&
        (!Number.isInteger(page.cursor) || page.cursor <= 0))
    )
      throw new Error(i18n.t("eventRegistration.failed"));
    if (page.cursor !== null && page.cursor <= (state.cursor ?? 0))
      throw new Error(i18n.t("eventRegistration.failed"));
    for (const remote of page.accounts) {
      if (
        !Number.isInteger(remote.global_id) ||
        remote.global_id! <= 0 ||
        !remote.username ||
        (names.has(remote.username) &&
          names.get(remote.username) !== remote.global_id)
      )
        throw new Error(i18n.t("eventRegistration.failed"));
      const previous = accounts.get(remote.global_id!);
      const base = previous ?? importNames(remote.username).accounts[0];
      if (!base) throw new Error(i18n.t("eventRegistration.failed"));
      const staff = base.staff || remote.staff;
      if (previous && previous.username !== remote.username)
        names.delete(previous.username);
      names.set(remote.username, remote.global_id);
      accounts.set(remote.global_id!, {
        ...base,
        username: remote.username,
        global_id: remote.global_id,
        roles: [...new Set([...base.roles, ...remote.roles])],
        staff,
        included: !staff,
        exclusion_reason: staff ? i18n.t("staff") : "",
        role_conflict:
          staff &&
          (base.roles.includes("participant") ||
            remote.roles.includes("participant")),
      });
    }
    if (accounts.size > 100000)
      throw new Error(i18n.t("eventRegistration.failed"));
    state.accounts = [...accounts.values()];
    state.unavailable += page.unavailable;
    state.cursor = page.cursor;
    if (page.cursor === null) {
      state.phase = state.phase === "participants" ? "organizers" : "complete";
    }
    emit();
  }
  if (
    new Set(state.accounts.map((a) => a.username)).size !==
    state.accounts.length
  )
    throw new Error(i18n.t("eventRegistration.failed"));
}

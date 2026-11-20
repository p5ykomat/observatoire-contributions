import { afterEach, expect, it, vi } from "vitest";
import {
  eventRegistrationImport,
  loadEventRegistration,
} from "./eventRegistrationImporter";
import { emptySession, type EventRegistrationSource } from "./types";
import { importArchive } from "./imports";

afterEach(() => vi.unstubAllGlobals());

const event: EventRegistrationSource = {
  id: 42,
  project: "metawiki",
  title: "Formation",
  url: "https://meta.wikimedia.org/wiki/Special:EventDetails/42",
  page_url: "https://meta.wikimedia.org/wiki/Event:Formation",
  start: "2026-02-01",
  end: "2026-02-02",
  starts_at: "2026-02-01T09:00:00Z",
  ends_at: "2026-02-02T17:00:00Z",
  timezone: "Europe/Paris",
  start_local: "2026-02-01 10:00",
  end_local: "2026-02-02 18:00",
  projects: ["frwiki"],
  all_projects: false,
  public_only: true,
  dates_confirmed: false,
  unavailable: 0,
  imported_at: "2026-02-03T12:00:00Z",
};
const participant = (id: number) => ({
  username: `Public${id}`,
  global_id: id,
  staff: false,
  included: true,
  roles: ["participant"],
});

it("imports every participant and organizer page, deduplicates global IDs and keeps event registration distinct from signup", async () => {
  const state = eventRegistrationImport(event.page_url);
  const calls: { kind: string; cursor: number | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/event-registration")) return Response.json(event);
      const body = JSON.parse(init.body as string);
      calls.push(body);
      if (body.kind === "participants")
        return Response.json(
          body.cursor === null
            ? {
                accounts: Array.from({ length: 20 }, (_, i) =>
                  participant(i + 1),
                ),
                cursor: 20,
                unavailable: 0,
              }
            : body.cursor === 20
              ? { accounts: [participant(21)], cursor: 21, unavailable: 1 }
              : { accounts: [], cursor: null, unavailable: 0 },
        );
      return Response.json(
        body.cursor === null
          ? {
              accounts: [
                {
                  ...participant(1),
                  staff: true,
                  included: false,
                  roles: ["organizer"],
                },
              ],
              cursor: 5,
              unavailable: 0,
            }
          : { accounts: [], cursor: null, unavailable: 0 },
      );
    }),
  );
  await loadEventRegistration(state, () => {}, new AbortController().signal);
  expect(calls.map((c) => [c.kind, c.cursor])).toEqual([
    ["participants", null],
    ["participants", 20],
    ["participants", 21],
    ["organizers", null],
    ["organizers", 5],
  ]);
  expect(state.accounts).toHaveLength(21);
  expect(state.phase).toBe("complete");
  expect(state.unavailable).toBe(1);
  expect(state.accounts[0]).toMatchObject({
    included: false,
    staff: true,
    role_conflict: true,
    registration: null,
    roles: ["participant", "organizer"],
  });
  const saved = emptySession();
  saved.params.start = event.start;
  saved.params.end = event.end;
  saved.event_registration = {
    ...event,
    dates_confirmed: true,
    unavailable: state.unavailable,
  };
  saved.cohort = state.accounts;
  expect(importArchive(JSON.stringify(saved)).event_registration).toEqual(
    saved.event_registration,
  );
});

it("pause and resume preserve the last completed page without refetching event metadata", async () => {
  const state = eventRegistrationImport(event.page_url);
  const abort = new AbortController();
  const cursors: (number | null)[] = [];
  let metadata = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/event-registration")) {
        metadata++;
        return Response.json(event);
      }
      const body = JSON.parse(init.body as string);
      cursors.push(body.cursor);
      return Response.json(
        body.kind === "participants" && body.cursor === null
          ? { accounts: [participant(1)], cursor: 1, unavailable: 0 }
          : { accounts: [], cursor: null, unavailable: 0 },
      );
    }),
  );
  await expect(
    loadEventRegistration(
      state,
      (value) => {
        if (value.cursor === 1) abort.abort();
      },
      abort.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(state.cursor).toBe(1);
  await loadEventRegistration(state, () => {}, new AbortController().signal);
  expect(metadata).toBe(1);
  expect(cursors).toEqual([null, 1, null]);
  expect(state.accounts).toHaveLength(1);
  expect(state.phase).toBe("complete");
});

it("a failed page does not turn a partial list into a completed import", async () => {
  const state = eventRegistrationImport(event.page_url);
  state.event = event;
  state.accounts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  await expect(
    loadEventRegistration(state, () => {}, new AbortController().signal),
  ).rejects.toBeDefined();
  expect(state.phase).toBe("participants");
  expect(state.cursor).toBeNull();
});

it("non-progressing cursors fail explicitly instead of looping or importing duplicates", async () => {
  const state = eventRegistrationImport(event.page_url);
  state.event = event;
  state.cursor = 5;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ accounts: [], cursor: 5, unavailable: 0 }),
    ),
  );
  await expect(
    loadEventRegistration(state, () => {}, new AbortController().signal),
  ).rejects.toBeDefined();
  expect(state.phase).toBe("participants");
});

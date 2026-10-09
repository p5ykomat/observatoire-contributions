import { z } from "zod";
import { importNames, parseCSV } from "./imports";
import type { RegistrationImport } from "./registrationImporter";
import { registrationImport } from "./registrationImporter";
import type { Session } from "./types";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const rowSchema = z.object({
  source: z.literal("frwiki-newusers"),
  username: z.string().min(1).max(256),
  username_json: z.string().min(1).max(2048),
  registration: z.string().datetime({ offset: true }),
  local_id: z.coerce.number().int().positive(),
  cohort_start: day,
  cohort_end: day,
  included: z.enum(["true", "false"]),
  exclusion_reason: z.string(),
  cohort_unavailable: z.coerce.number().int().nonnegative(),
});
export function cohortFilename(
  start: string,
  end: string,
  extension: "csv" | "txt",
) {
  return `nouveaux-comptes-frwiki_${start}${end === start ? "" : "_" + end}.${extension}`;
}
export function cohortFileDates(name: string) {
  const match =
    /^nouveaux-comptes-frwiki_(\d{4}-\d{2}-\d{2})(?:_(\d{4}-\d{2}-\d{2}))?\.(?:csv|txt)$/i.exec(
      name,
    );
  if (
    !match ||
    !day.safeParse(match[1]).success ||
    !day.safeParse(match[2] ?? match[1]).success
  )
    return null;
  return { start: match[1], end: match[2] ?? match[1] };
}
export function cohortRows(data: RegistrationImport | Session) {
  const source =
    "new_accounts" in data ? data.new_accounts! : (data as RegistrationImport);
  const accounts =
    "cohort" in data ? data.cohort : (data as RegistrationImport).accounts;
  return accounts.map((a) => ({
    source: "frwiki-newusers",
    username: a.username,
    username_json: JSON.stringify(a.username),
    registration: a.signup!.timestamp,
    local_id: a.signup!.local_id,
    cohort_start: source.start,
    cohort_end: source.end,
    included: a.included,
    exclusion_reason: a.exclusion_reason,
    cohort_unavailable: source.unavailable,
  }));
}
export function parseCohortCSV(text: string): RegistrationImport | null {
  const rows = parseCSV(text),
    header = rows[0];
  if (!header.includes("cohort_start") || !header.includes("source"))
    return null;
  if (
    new Set(header).size !== header.length ||
    rows.length < 2 ||
    rows.length > 100001
  )
    throw new Error("cohort-file");
  const parsed = rows
    .slice(1)
    .map((values) =>
      rowSchema.parse(
        Object.fromEntries(header.map((key, index) => [key, values[index]])),
      ),
    );
  const first = parsed[0],
    state = registrationImport(first.cohort_start, first.cohort_end);
  const ids = new Set<number>(),
    names = new Set<string>();
  for (const row of parsed) {
    const name: unknown = JSON.parse(row.username_json);
    if (typeof name !== "string") throw new Error("cohort-file");
    if (
      row.cohort_start !== state.start ||
      row.cohort_end !== state.end ||
      row.cohort_unavailable !== first.cohort_unavailable ||
      state.start > state.end ||
      row.registration.slice(0, 10) < state.start ||
      row.registration.slice(0, 10) > state.end ||
      ids.has(row.local_id) ||
      names.has(name)
    )
      throw new Error("cohort-file");
    ids.add(row.local_id);
    names.add(name);
    const account = importNames(name).accounts[0];
    if (!account || account.username !== name) throw new Error("cohort-file");
    state.accounts.push({
      ...account,
      registration: row.registration,
      included: row.included === "true",
      exclusion_reason: row.exclusion_reason,
      signup: {
        timestamp: row.registration,
        local_id: row.local_id,
        original_name: row.username,
      },
    });
  }
  state.complete = true;
  state.action = 3;
  state.unavailable = first.cohort_unavailable;
  return state;
}

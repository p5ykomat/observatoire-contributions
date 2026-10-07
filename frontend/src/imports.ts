import Papa from "papaparse";
import { z } from "zod";
import i18n from "./i18n";
import { CATEGORIES, emptySession, type Account, type Session } from "./types";
export const normalize = (name: string) => {
  const n = name.normalize("NFC").replaceAll("_", " ").trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
};
export function importNames(text: string): {
  accounts: Account[];
  diagnostics: string[];
} {
  if (text.length > 2 * 1024 * 1024) throw new Error(i18n.t("errors.file"));
  const accounts: Account[] = [],
    diagnostics: string[] = [];
  const seen = new Set<string>();
  let blank = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    const name = normalize(line);
    if (!name) {
      blank++;
      return;
    }
    if (name.length > 255 || /[\x00-\x1f|#<>\[\]{}]/.test(name)) {
      diagnostics.push(i18n.t("invalidLine", { line: index + 1, name: line }));
      return;
    }
    if (seen.has(name)) {
      diagnostics.push(i18n.t("duplicate", { name }));
      return;
    }
    seen.add(name);
    accounts.push({
      username: name,
      registration: null,
      groups: [],
      locked: false,
      exists: null,
      bot: false,
      included: true,
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
    });
  });
  if (blank) diagnostics.push(i18n.t("blank", { count: blank }));
  if (accounts.length > 1000) throw new Error(i18n.t("limit"));
  return { accounts, diagnostics };
}
export function parseCSV(text: string) {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length || parsed.data.length < 1)
    throw new Error(i18n.t("errors.csv"));
  return parsed.data;
}
export async function readFile(file: File, archive = false) {
  if (file.size > (archive ? 50 : 2) * 1024 * 1024)
    throw new Error(i18n.t("errors.file"));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error(i18n.t("errors.file"));
  }
}
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
  );
const accountSchema = z.object({
  username: z.string().min(1).max(255),
  registration: z.string().nullable(),
  groups: z.array(z.string()),
  locked: z.boolean(),
  exists: z.boolean().nullable(),
  bot: z.boolean(),
  included: z.boolean(),
  exclusion_reason: z.string(),
  roles: z.array(z.string()),
  staff: z.boolean(),
  role_conflict: z.boolean(),
  technical: z.enum([
    "pending",
    "running",
    "retrying",
    "completed_primary",
    "completed_fallback",
    "partial",
    "failed",
  ]),
  warnings: z.array(z.string()),
  providers: z.array(z.string()),
  qualified: z.boolean(),
  pre_complete: z.boolean(),
  post_complete: z.boolean(),
  global_id: z.number().optional(),
  global_editcount: z.number().optional(),
  invalid: z.boolean().optional(),
});
const editSchema = z.object({
  username: z.string(),
  project: z.string(),
  revision: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  namespace: z.number().int(),
  title: z.string(),
  category: z.enum(CATEGORIES),
  automation: z.enum(["normal", "bot", "detected", "unknown"]),
  tags: z.array(z.string()),
  provider: z.string(),
});
const paramsSchema = z
  .object({
    title: z.string().max(500),
    start: day,
    end: day,
    reference: day,
    origins: z.array(z.string()).min(1),
    projects: z.array(z.string()),
    scope: z.enum(["origin", "custom", "all"]),
    creation_before: z.number().int().min(0).max(36500),
    creation_after: z.number().int().min(0).max(36500),
    creation_restriction: z.boolean(),
    pre_days: z.number().int().min(1).max(36500),
    pre_threshold: z.number().int().min(0),
    selection: z.enum(["all", "new", "new_reactivated", "manual"]),
    categories: z.array(z.enum(CATEGORIES)),
    exclude_automation: z.boolean(),
  })
  .refine((p) => p.start <= p.end && p.end <= p.reference);
const schema = z.object({
  schema_version: z.literal("1.0"),
  methodology_version: z.literal("1.0"),
  application_version: z.literal("1.0.0"),
  generated_at: z.string(),
  params: paramsSchema,
  cohort: z.array(accountSchema).max(1000),
  edits: z.array(editSchema).max(2000000),
  catalog: z.array(
    z.object({
      id: z.string(),
      domain: z.string(),
      label: z.string(),
      family: z.string(),
      closed: z.boolean().optional(),
    }),
  ),
  namespaces: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        id: z.number(),
        name: z.string().optional(),
        canonical: z.string().optional(),
      }),
    ),
  ),
  taxonomy: z
    .object({
      version: z.string(),
      community_suffix: z.string(),
      maintenance: z.array(z.string()),
      families: z.record(z.string(), z.record(z.string(), z.enum(CATEGORIES))),
      projects: z.record(z.string(), z.record(z.string(), z.enum(CATEGORIES))),
      default: z.enum(CATEGORIES),
    })
    .nullable(),
  queue: z.array(
    z.object({
      provider: z.enum(["mediawiki", "xtools"]),
      usernames: z.array(z.string()).min(1).max(50),
      project: z.string().optional(),
      cursor: z.string().optional(),
      fallback: z.boolean().optional(),
      attempts: z.number().int().min(0),
      end: day.optional(),
    }),
  ),
  diagnostics: z.array(z.string()),
  stage: z.number().int().min(0).max(5),
  collection_signature: z.string().nullable(),
  question: z
    .object({
      days: z.union([z.number().int().min(1).max(36500), z.literal("today")]),
      families: z.array(z.string()).max(100),
      wikipedia_languages: z.array(z.string()).max(1000),
      wikipedia_categories: z.array(z.enum(CATEGORIES)),
    })
    .optional(),
});
export function importArchive(text: string): Session {
  try {
    const s = schema.parse(JSON.parse(text));
    const names = new Set(s.cohort.map((a) => a.username));
    if (
      names.size !== s.cohort.length ||
      s.edits.some((e) => !names.has(e.username))
    )
      throw new Error();
    return { ...emptySession(), ...s, stage: 4 };
  } catch {
    throw new Error(i18n.t("errors.schema"));
  }
}

export const CATEGORIES = [
  "CONTENT",
  "STRUCTURED_DATA",
  "MEDIA",
  "MAINTENANCE",
  "COMMUNITY",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Segment = "new" | "reactivated" | "active" | "unknown";
export type Technical =
  | "pending"
  | "running"
  | "retrying"
  | "completed_primary"
  | "completed_fallback"
  | "partial"
  | "failed";
export interface Project {
  id: string;
  domain: string;
  label: string;
  family: string;
  closed?: boolean;
}
export interface Account {
  username: string;
  registration: string | null;
  global_id?: number;
  global_editcount?: number;
  groups: string[];
  locked: boolean;
  exists: boolean | null;
  invalid?: boolean;
  bot: boolean;
  included: boolean;
  exclusion_reason: string;
  roles: string[];
  staff: boolean;
  role_conflict: boolean;
  technical: Technical;
  warnings: string[];
  providers: string[];
  qualified: boolean;
  pre_complete: boolean;
  post_complete: boolean;
}
export interface Edit {
  username: string;
  project: string;
  revision: number;
  timestamp: string;
  namespace: number;
  title: string;
  category: Category;
  automation: "normal" | "bot" | "detected" | "unknown";
  tags: string[];
  provider: string;
}
export interface Params {
  title: string;
  start: string;
  end: string;
  reference: string;
  origins: string[];
  projects: string[];
  scope: "origin" | "custom" | "all";
  creation_before: number;
  creation_after: number;
  creation_range?: { start: string; end: string };
  creation_restriction: boolean;
  pre_days: number;
  pre_threshold: number;
  selection: "all" | "new" | "new_reactivated" | "manual";
  categories: Category[];
  exclude_automation: boolean;
}
export interface Task {
  provider: "mediawiki" | "xtools";
  usernames: string[];
  project?: string;
  cursor?: string;
  fallback?: boolean;
  attempts: number;
  end?: string;
}
export interface Taxonomy {
  version: string;
  community_suffix: string;
  maintenance: string[];
  families: Record<string, Record<string, Category>>;
  projects: Record<string, Record<string, Category>>;
  default: Category;
}
export interface Session {
  schema_version: "1.0";
  methodology_version: "1.0";
  application_version: "1.0.0";
  generated_at: string;
  params: Params;
  cohort: Account[];
  edits: Edit[];
  catalog: Project[];
  namespaces: Record<
    string,
    Record<string, { id: number; name?: string; canonical?: string }>
  >;
  taxonomy: Taxonomy | null;
  queue: Task[];
  diagnostics: string[];
  stage: number;
  collection_signature: string | null;
  question?: FollowupQuestion;
}
export interface FollowupQuestion {
  days: number | "today";
  families: string[];
  wikipedia_languages: string[];
  wikipedia_categories: Category[];
}
export function defaultQuestion(): FollowupQuestion {
  return {
    days: 30,
    families: ["*"],
    wikipedia_languages: ["fr", "en"],
    wikipedia_categories: ["CONTENT"],
  };
}
export const today = () => new Date().toISOString().slice(0, 10);
export function emptySession(): Session {
  return {
    schema_version: "1.0",
    methodology_version: "1.0",
    application_version: "1.0.0",
    generated_at: new Date().toISOString(),
    params: {
      title: "",
      start: "",
      end: "",
      reference: today(),
      origins: ["frwiki"],
      projects: ["frwiki", "wikidatawiki", "commonswiki"],
      scope: "all",
      creation_before: 14,
      creation_after: 0,
      creation_restriction: false,
      pre_days: 180,
      pre_threshold: 2,
      selection: "all",
      categories: [...CATEGORIES],
      exclude_automation: false,
    },
    cohort: [],
    edits: [],
    catalog: [],
    namespaces: {},
    taxonomy: null,
    queue: [],
    diagnostics: [],
    stage: 0,
    collection_signature: null,
  };
}

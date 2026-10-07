import { api, retry } from "./api";
import { dateMs, DAY, signature } from "./analysis/cohorts";
import { classify } from "./analysis/taxonomy";
import { aggregate } from "./analysis/aggregation";
import i18n, { isMessage } from "./i18n";
import {
  type Account,
  type Edit,
  type Project,
  type Session,
  type Task,
  type Taxonomy,
} from "./types";
interface LocalInfo {
  merged?: { wiki: string; editcount: number; groups?: string[] }[];
  groups?: string[];
}
interface NamespaceResult {
  project: Project;
  namespaces: Session["namespaces"][string];
}
interface MWPage {
  contributions: Edit[];
  cursor: string | null;
}
interface XTEdit {
  username: string;
  project: string;
  rev_id: number;
  timestamp: string;
  namespace: number;
  page_title: string;
}
type Publish = (s: Session) => void;
export class Collector {
  paused = false;
  stopped = false;
  controller = new AbortController();
  private editKeys: Set<string>;
  constructor(
    public session: Session,
    private publish: Publish,
  ) {
    this.editKeys = new Set(
      session.edits.map((e) => e.project + ":" + e.revision),
    );
  }
  emit() {
    this.publish({
      ...this.session,
      cohort: this.session.cohort.map((a) => ({ ...a })),
      edits: [...this.session.edits],
      queue: [...this.session.queue],
      namespaces: { ...this.session.namespaces },
      diagnostics: [...this.session.diagnostics],
    });
  }
  pause() {
    this.paused = true;
    this.emit();
  }
  resume() {
    this.paused = false;
    this.emit();
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    this.session.stage = 4;
    this.emit();
  }
  async gate() {
    while (this.paused && !this.stopped)
      await new Promise((r) => setTimeout(r, 100));
    if (this.stopped) throw new DOMException("", "AbortError");
  }
  async call<T>(
    path: string,
    body?: unknown,
    accounts: string[] = [],
  ): Promise<T> {
    await this.gate();
    return retry(
      async () => {
        await this.gate();
        return api<T>(path, body, this.controller.signal);
      },
      () => {
        this.session.cohort
          .filter((a) => accounts.includes(a.username))
          .forEach((a) => (a.technical = "retrying"));
        this.emit();
      },
      this.controller.signal,
    );
  }
  async metadata() {
    if (!this.session.catalog.length)
      this.session.catalog = await this.call<Project[]>("projects");
    if (!this.session.taxonomy)
      this.session.taxonomy = await this.call<Taxonomy>("taxonomy");
  }
  async qualify() {
    for (let offset = 0; offset < this.session.cohort.length; offset += 50) {
      await this.gate();
      const group = this.session.cohort
        .slice(offset, offset + 50)
        .filter((a) => !a.qualified);
      if (!group.length) continue;
      try {
        const result = await this.call<Partial<Account>[]>("qualify", {
          usernames: group.map((a) => a.username),
        });
        group.forEach((a) => {
          const remote = result.find((r) => r.username === a.username);
          if (remote) {
            const botPreviouslyKnown = a.bot;
            Object.assign(a, remote, { qualified: true });
            a.warnings = a.warnings.filter(
              (warning) => !isMessage(warning, "unqualified"),
            );
            if (a.exists === false || (a.bot && !botPreviouslyKnown)) {
              a.included = false;
              a.exclusion_reason = i18n.t(a.bot ? "bot" : "missing");
            }
          } else {
            a.qualified = false;
            a.warnings = [i18n.t("unqualified")];
          }
        });
      } catch (error) {
        if (this.stopped) throw error;
        group.forEach((a) => {
          a.warnings = [i18n.t("unqualified")];
        });
      }
      this.emit();
    }
  }
  async local(name: string): Promise<string[]> {
    const info = await this.call<LocalInfo>(
      "local-accounts",
      { usernames: [name] },
      [name],
    );
    const a = this.session.cohort.find((a) => a.username === name)!;
    if (!a.bot && info.merged?.some((w) => w.groups?.includes("bot"))) {
      a.bot = true;
      a.included = false;
      a.exclusion_reason = i18n.t("bot");
    }
    return (info.merged ?? [])
      .filter((w) => w.editcount > 0)
      .map((w) => w.wiki);
  }
  async prepare(recollect = false) {
    await this.metadata();
    const p = this.session.params;
    const sameScope = this.session.collection_signature === signature(p);
    if (!sameScope) {
      // The coverage flags belong to the previous dates/projects, including
      // accounts currently outside the selection that may be included later.
      this.session.cohort.forEach((a) => {
        a.pre_complete = false;
        a.post_complete = false;
        a.technical = "pending";
      });
    }
    const retained = aggregate(this.session)
      .rows.filter((row) => row.included)
      .map((row) => row.account);
    const names = new Set(retained.map((a) => a.username));
    const resumed =
      sameScope && !recollect
        ? this.session.queue
            .map((task) => ({
              ...task,
              usernames: task.usernames.filter((name) => names.has(name)),
            }))
            .filter((task) => task.usernames.length)
        : [];
    const queued = new Set(resumed.flatMap((task) => task.usernames));
    const tasks: Task[] = [];
    const chosen = p.scope === "origin" ? p.origins : p.projects;
    for (const a of retained) {
      if (
        (sameScope && a.pre_complete && a.post_complete) ||
        queued.has(a.username)
      )
        continue;
      if (!a.qualified || a.exists !== true) {
        a.technical = "failed";
        continue;
      }
      a.warnings = [];
      a.providers = [];
      a.pre_complete = false;
      a.post_complete = false;
      a.technical = "pending";
      if (p.scope === "all") {
        tasks.push({
          provider: "xtools",
          usernames: [a.username],
          attempts: 0,
        });
        continue;
      }
      try {
        const locals = await this.local(a.username);
        if (!a.included) continue;
        for (const project of new Set([...locals, ...chosen]))
          tasks.push({
            provider: "mediawiki",
            usernames: [a.username],
            project,
            attempts: 0,
            ...(!chosen.includes(project) ? { end: p.end } : {}),
          });
        if (!locals.length && !chosen.length) {
          a.pre_complete = true;
          a.post_complete = true;
          a.technical = "completed_primary";
        }
      } catch (error) {
        if (this.stopped) throw error;
        a.technical = "failed";
        a.warnings.push(i18n.t("partial"));
      }
    }
    // Batch up to 50 accounts on the same wiki and time interval. Global calls remain sequential.
    const batches: Task[] = [];
    for (const task of tasks) {
      const batch = batches.find(
        (b) =>
          b.provider === "mediawiki" &&
          task.provider === "mediawiki" &&
          b.project === task.project &&
          b.end === task.end &&
          b.usernames.length < 50,
      );
      if (batch) batch.usernames.push(...task.usernames);
      else batches.push(task);
    }
    // Keep resumed cursors separate from fresh batches: new accounts must
    // start at the beginning rather than inherit another account's cursor.
    this.session.queue = [...resumed, ...batches];
    this.session.collection_signature = signature(p);
    this.session.generated_at = new Date().toISOString();
    this.emit();
  }
  async namespaces(project: string) {
    if (!this.session.namespaces[project]) {
      const result = await this.call<NamespaceResult>(
        "namespaces/" + encodeURIComponent(project),
      );
      this.session.namespaces[project] = result.namespaces;
      // Raw contributions survive metadata failures. Reclassify them when
      // metadata becomes available, including rows restored from an archive.
      for (const edit of this.session.edits)
        if (edit.project === project)
          edit.category = classify(this.session, project, edit.namespace);
    }
  }
  add(edits: Edit[]) {
    for (const e of edits) {
      const key = e.project + ":" + e.revision;
      if (!this.editKeys.has(key)) {
        e.category = classify(this.session, e.project, e.namespace);
        this.session.edits.push(e);
        this.editKeys.add(key);
      }
    }
  }
  complete(task: Task) {
    for (const name of task.usernames) {
      const a = this.session.cohort.find((a) => a.username === name)!;
      const outstanding = this.session.queue.some((t) =>
        t.usernames.includes(name),
      );
      if (!outstanding) {
        a.pre_complete = !a.warnings.length;
        a.post_complete = !a.warnings.length;
        a.technical = a.warnings.length
          ? this.session.edits.some((e) => e.username === name)
            ? "partial"
            : "failed"
          : a.providers.includes("fallback")
            ? "completed_fallback"
            : "completed_primary";
      } else a.technical = "pending";
    }
  }
  async run() {
    const p = this.session.params;
    const start = new Date(dateMs(p.start) - p.pre_days * DAY)
      .toISOString()
      .slice(0, 10);
    try {
      while (this.session.queue.length && !this.stopped) {
        await this.gate();
        const task = this.session.queue[0];
        const accounts = this.session.cohort.filter((a) =>
          task.usernames.includes(a.username),
        );
        accounts.forEach((a) => (a.technical = "running"));
        this.emit();
        try {
          let cursor: string | null = null;
          if (task.provider === "mediawiki") {
            await this.namespaces(task.project!);
            const page = await this.call<MWPage>(
              "contributions",
              {
                usernames: task.usernames,
                project: task.project,
                start,
                end: task.end ?? p.reference,
                cursor: task.cursor,
              },
              task.usernames,
            );
            this.add(page.contributions);
            cursor = page.cursor;
          } else {
            const page = await this.call<{
              rows: XTEdit[];
              cursor: string | null;
            }>(
              "global-contributions",
              {
                username: task.usernames[0],
                start,
                end: p.reference,
                cursor: task.cursor,
              },
              task.usernames,
            );
            const edits: Edit[] = [];
            for (const row of page.rows) {
              const wiki = this.session.catalog.find(
                (w) => w.domain === row.project || w.id === row.project,
              );
              if (!wiki) {
                accounts.forEach((a) => {
                  if (!a.warnings.includes(row.project))
                    a.warnings.push(row.project);
                });
                continue;
              }
              edits.push({
                username: row.username ?? task.usernames[0],
                project: wiki.id,
                revision: row.rev_id,
                timestamp: row.timestamp,
                namespace: row.namespace,
                title: row.page_title,
                category: "OTHER",
                automation: "unknown",
                tags: [],
                provider: "xtools",
              });
            }
            this.add(edits);
            for (const project of new Set(edits.map((edit) => edit.project))) {
              try {
                await this.namespaces(project);
              } catch (error) {
                if (this.stopped) throw error;
                const warning = i18n.t("collectionNamespaceUnavailable", {
                  project: this.session.catalog.find(
                    (wiki) => wiki.id === project,
                  )!.domain,
                });
                accounts.forEach((account) => {
                  if (!account.warnings.includes(warning))
                    account.warnings.push(warning);
                });
              }
            }
            cursor = page.cursor;
          }
          accounts.forEach((a) => {
            const provider = task.fallback ? "fallback" : task.provider;
            if (!a.providers.includes(provider)) a.providers.push(provider);
          });
          if (cursor && cursor === task.cursor) throw new Error("pagination");
          if (cursor) {
            task.cursor = cursor;
            task.attempts = 0;
          } else {
            this.session.queue.shift();
            this.complete(task);
          }
        } catch {
          if (this.stopped) break;
          this.session.queue.shift();
          if (task.provider === "xtools") {
            try {
              const locals = await this.local(task.usernames[0]);
              if (
                !locals.every((id) =>
                  this.session.catalog.some((w) => w.id === id),
                )
              )
                accounts.forEach((a) => a.warnings.push(i18n.t("partial")));
              for (const project of (accounts.every((a) => a.included)
                ? locals
                : []
              ).filter((id) => this.session.catalog.some((w) => w.id === id)))
                this.session.queue.push({
                  provider: "mediawiki",
                  usernames: task.usernames,
                  project,
                  fallback: true,
                  attempts: 0,
                });
              accounts.forEach((a) => {
                if (!a.providers.includes("fallback"))
                  a.providers.push("fallback");
              });
              this.complete(task);
            } catch {
              accounts.forEach((a) => {
                a.warnings.push(i18n.t("partial"));
              });
              this.complete(task);
            }
          } else {
            accounts.forEach((a) => a.warnings.push(i18n.t("partial")));
            this.complete(task);
          }
        }
        this.emit();
      }
      if (!this.stopped) {
        this.session.stage = 4;
        this.emit();
      }
    } catch (error) {
      if (!this.stopped) throw error;
    }
  }
}

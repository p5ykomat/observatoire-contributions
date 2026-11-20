import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { emptySession, type Edit, type Session } from "../src/types";
import { signature } from "../src/analysis/cohorts";

function fixture() {
  const s = emptySession();
  s.params.start = s.params.end = "2026-02-01";
  s.params.reference = "2026-10-09";
  s.question = {
    days: 90,
    families: ["*"],
    wikipedia_languages: ["*"],
    wikipedia_categories: ["CONTENT"],
  };
  s.catalog = [
    {
      id: "frwiki",
      domain: "fr.wikipedia.org",
      label: "FR",
      family: "wikipedia",
    },
  ];
  s.cohort = ["TestAccountA", "TestAccountB", "NoContribution"].map(
    (username) => ({
      username,
      registration: "2026-01-01T00:00:00Z",
      groups: [],
      locked: false,
      bot: false,
      included: true,
      exclusion_reason: "",
      roles: [],
      staff: false,
      role_conflict: false,
      warnings: [],
      providers: ["mediawiki"],
      exists: true,
      qualified: true,
      pre_complete: true,
      post_complete: true,
      technical: "completed_primary" as const,
    }),
  );
  const edit = (
    revision: number,
    page_id: number,
    username: string,
    new_page: boolean,
  ): Edit => ({
    username,
    project: "frwiki",
    revision,
    page_id,
    new_page,
    timestamp: "2026-02-03T12:00:00Z",
    namespace: 0,
    title: page_id === 42 ? "Physics article" : "History article",
    category: "CONTENT",
    automation: "normal",
    tags: [],
    provider: "mediawiki",
  });
  s.edits = [
    edit(1, 42, "TestAccountA", true),
    edit(2, 42, "TestAccountA", false),
    edit(3, 43, "TestAccountB", false),
  ];
  s.collection_signature = signature(s.params);
  return s;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/article-status", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        pages: body.creations.map((edit: Edit) => ({
          project: body.project,
          revision: edit.revision,
          title: edit.title,
          current_title: edit.title,
          page_id: edit.page_id ?? null,
          status: edit.deleted_page ? "deleted" : "online",
          recreated: false,
          redirect: false,
          disambiguation: false,
          checked_at: "2026-11-20T12:00:00Z",
        })),
      },
    });
  });
});

async function restore(page: Page, s = fixture()) {
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: s.catalog }),
  );
  await page.goto("/");
  await page.locator('input[accept=".json"]').setInputFiles({
    name: "analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await page.locator(".key-figures > summary").click();
  await page.locator(".topics-disclosure > summary").click();
  return page.locator(".wikipedia-topics");
}
async function model(page: Page, onCall?: (id: number) => Promise<void>) {
  await page.route("**/api/article-topics", async (route) => {
    const body = route.request().postDataJSON();
    await onCall?.(body.page_id);
    await route.fulfill({
      json: {
        project: "frwiki",
        title: body.title,
        page_id: body.page_id,
        first_revision: body.page_id === 42 ? 1 : 3,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-11-20T12:00:00Z",
        status: "classified",
        topics:
          body.page_id === 42
            ? [{ topic: "STEM.Physics", score: 0.8 }]
            : [{ topic: "History_and_Society.History", score: 0.8 }],
      },
    });
  });
}

test("simple public-article choices show themes and subtopics and preserve selection in JSON", async ({
  page,
}) => {
  const calls: number[] = [];
  await model(page, async (id) => {
    calls.push(id);
  });
  let section = await restore(page);
  await expect(section.getByLabel("Mesure du classement")).toHaveCount(0);
  await expect(section.locator("select option")).toHaveCount(2);
  await section.getByText("Comprendre le modèle", { exact: true }).click();
  await expect(section.getByText(/Il utilise fastText/)).toBeVisible();
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section.getByText("Classés : 1", { exact: true })).toBeVisible();
  await expect(section).toContainText(
    "Articles distincts retenus pour les thématiques : 1.",
  );
  await expect(section.locator(".topic-subtopics")).toContainText("Physique");
  await expect(section.getByText(/Pages vérifiées/)).toHaveCount(0);
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("modification");
  await expect(section.locator(".topic-bars")).toHaveCount(0);
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section).toContainText(
    "Articles distincts retenus pour les thématiques : 2.",
  );
  await expect.poll(() => calls.length).toBe(4);
  const download = page.waitForEvent("download");
  await section
    .getByRole("button", { name: "Exporter les statistiques thématiques CSV" })
    .click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain("subtopic");
  expect(csv).toContain("modification");
  expect(csv).toContain("deleted_articles_excluded");
  const jsonDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const saved = JSON.parse(
    await readFile((await (await jsonDownload).path())!, "utf8"),
  );
  expect(saved.article_topics_kind).toBe("modification");
  expect(saved.article_status["frwiki:1"].status).toBe("online");
  section = await restore(page, saved);
  await expect(section.getByLabel("Créations ou modifications")).toHaveValue(
    "modification",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a failed model request remains visible and retrying it does not change retention counts", async ({
  page,
}) => {
  let fail = true,
    count = 0;
  await page.route("**/api/article-topics", async (route) => {
    count++;
    const b = route.request().postDataJSON();
    if (fail) return route.fulfill({ status: 404, json: {} });
    await route.fulfill({
      json: {
        project: "frwiki",
        title: b.title,
        page_id: b.page_id,
        first_revision: 1,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-11-20T12:00:00Z",
        status: "unclassified",
        topics: [],
      },
    });
  });
  const section = await restore(page);
  const before = await page.locator(".kpis").innerText();
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section).toContainText("Non récupérés par le modèle : 1");
  expect(await page.locator(".kpis").innerText()).toBe(before);
  fail = false;
  await section
    .getByRole("button", {
      name: "Réessayer les articles indisponibles",
      exact: true,
    })
    .click();
  await expect(section).toContainText("Sans thème reconnu : 1");
  await expect(section.getByText(/Non récupérés par le modèle/)).toHaveCount(0);
  expect(count).toBe(2);
  expect(await page.locator(".kpis").innerText()).toBe(before);
});

test("pause preserves completed classifications and resuming only checks remaining pages", async ({
  page,
}) => {
  const s = fixture();
  s.edits[2].new_page = true;
  const calls: number[] = [];
  let slow = true;
  await model(page, async (id) => {
    calls.push(id);
    if (id === 43 && slow)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  });
  const section = await restore(page, s);
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect.poll(() => calls.includes(43)).toBe(true);
  await section
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await expect(
    section.getByRole("button", { name: "Analyser", exact: true }),
  ).toBeEnabled();
  await expect(section).toContainText("Classés : 1");
  slow = false;
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section).toContainText("Classés : 2");
  expect(calls.filter((id) => id === 42)).toHaveLength(1);
});

test("40 creations reconcile with 23 deletions and 15 retained public topic articles without overlapping denominators", async ({
  page,
}) => {
  const s = fixture();
  s.deleted_collection_version = 1;
  s.cohort.forEach((a) => {
    a.deleted_complete = true;
    a.deleted_classified = true;
  });
  s.edits = Array.from({ length: 40 }, (_, i) => ({
    ...s.edits[0],
    revision: i + 1,
    page_id: i < 23 ? null : i + 1,
    title: `Page ${i + 1}`,
    new_page: true,
    deleted_page: i < 23,
  }));
  const queried: number[] = [];
  await page.route("**/api/article-topics", async (route) => {
    const b = route.request().postDataJSON();
    queried.push(b.page_id);
    if (b.page_id === 26) return route.fulfill({ status: 404, json: {} });
    await route.fulfill({
      json: {
        project: "frwiki",
        title: b.title,
        page_id: b.page_id,
        first_revision: b.page_id,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-11-20T12:00:00Z",
        status: b.page_id < 26 ? "excluded" : "classified",
        topics: b.page_id < 26 ? [] : [{ topic: "STEM.Physics", score: 0.8 }],
      },
    });
  });
  const section = await restore(page, s);
  await expect(page.locator(".results-settings")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByRole("heading", {
      name: "Articles Wikipédia ensuite supprimés",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".deleted-controls")).toContainText("uniquement");
  await expect(page.locator(".wikipedia-creation-kpi strong")).toHaveText("40");
  await expect(page.locator(".article-statistics")).toContainText(
    "Pages toujours accessibles : 17.",
  );
  await expect(page.locator(".article-statistics")).toContainText(
    "Pages d’origine supprimées : 23.",
  );
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section).toContainText(
    "Articles distincts retenus pour les thématiques : 15.",
  );
  await expect(section).toContainText("Classés : 14");
  await expect(section).toContainText("Non récupérés par le modèle : 1");
  await expect(section).toContainText("2 pages sont écartées");
  await expect(
    section.getByText(/Pages vérifiées|Articles supprimés inclus/),
  ).toHaveCount(0);
  expect(queried).toHaveLength(17);
  expect(queried.every((id) => id > 23)).toBe(true);
  await page
    .getByLabel("Inclure les créations d’articles ensuite supprimés", {
      exact: true,
    })
    .uncheck();
  await expect(page.locator(".wikipedia-creation-kpi strong")).toHaveText("17");
  await expect(section).toContainText(
    "Articles distincts retenus pour les thématiques : 15.",
  );
  expect(queried).toHaveLength(17);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("../output/article-count-review", { recursive: true });
  await page.screenshot({
    path: "../output/article-count-review/coherent-statistics-desktop.png",
    fullPage: true,
  });
});

test("legacy creation metadata is resolved without treating unknown edits as modifications", async ({
  page,
}) => {
  const s = fixture();
  s.edits = s.edits.slice(0, 2).map((e) => ({ ...e, new_page: undefined }));
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/article-topics", async (route) => {
    const b = route.request().postDataJSON();
    bodies.push(b);
    await route.fulfill({
      json: {
        project: "frwiki",
        title: b.title,
        page_id: 42,
        first_revision: 1,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-11-20T12:00:00Z",
        status: "classified",
        topics: [{ topic: "STEM.Physics", score: 0.8 }],
      },
    });
  });
  const section = await restore(page, s);
  await expect(page.locator(".wikipedia-creation-kpi strong")).toHaveText(
    "≥ 0",
  );
  await section.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(section).toContainText(
    "Articles distincts retenus pour les thématiques : 1.",
  );
  expect(bodies[0].creation_revision).toBe(1);
  await expect(page.locator(".wikipedia-creation-kpi strong")).toHaveText("1");
});

test("page status failures identify affected pages and can be refreshed without affecting contributions", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/article-status", async (route) => {
    if (fail) return route.fulfill({ status: 404, json: {} });
    const b = route.request().postDataJSON();
    await route.fulfill({
      json: {
        pages: b.creations.map((e: Edit) => ({
          project: b.project,
          revision: e.revision,
          title: e.title,
          current_title: e.title,
          page_id: e.page_id,
          status: "online",
          recreated: false,
          redirect: false,
          disambiguation: false,
          checked_at: "2026-11-20T12:00:00Z",
        })),
      },
    });
  });
  await restore(page);
  const stats = page.locator(".article-statistics");
  await expect(stats).toContainText("État non confirmé : 1.");
  await stats
    .getByText("Voir les pages dont l’état reste à confirmer", { exact: true })
    .click();
  await expect(stats.locator("details")).toContainText("Physics article");
  const totals = await page.locator(".kpis").innerText();
  fail = false;
  await stats
    .getByRole("button", { name: "Actualiser l’état des pages", exact: true })
    .click();
  await expect(stats).toContainText("Pages toujours accessibles : 1.");
  await expect(stats.getByText(/État non confirmé/)).toHaveCount(0);
  expect(await page.locator(".kpis").innerText()).toBe(totals);
  await page.locator(".facts-list details > summary").first().click();
  await expect(
    page
      .locator(".facts-list")
      .getByRole("link", {
        name: "Contributions sur fr.wikipedia.org",
        exact: true,
      })
      .first(),
  ).toHaveAttribute(
    "href",
    "https://fr.wikipedia.org/wiki/Special:Contributions/TestAccountB",
  );
});

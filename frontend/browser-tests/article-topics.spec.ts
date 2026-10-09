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

async function restore(page: Page, s = fixture()) {
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(s.catalog),
    }),
  );
  await page.goto("/");
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await expect(
    page.getByRole("heading", {
      name: "Thématiques des articles Wikipédia, bêta",
    }),
  ).toBeVisible();
}

async function model(page: Page, onCall?: (id: number) => Promise<void>) {
  await page.route("**/api/article-topics", async (route) => {
    const body = route.request().postDataJSON();
    await onCall?.(body.page_id);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: "frwiki",
        title: body.title,
        page_id: body.page_id,
        first_revision: body.page_id === 42 ? 1 : 3,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-10-09T12:00:00Z",
        status: "classified",
        topics:
          body.page_id === 42
            ? [
                { topic: "STEM.STEM*", score: 0.9 },
                { topic: "STEM.Physics", score: 0.7 },
                { topic: "History_and_Society.History", score: 0.6 },
              ]
            : [{ topic: "History_and_Society.History", score: 0.8 }],
      }),
    });
  });
}

test("article topics explain the model, distinguish measures, reuse predictions and persist exports", async ({
  page,
}) => {
  const calls: number[] = [];
  await model(page, async (id) => {
    calls.push(id);
  });
  await restore(page);
  const section = page.locator(".wikipedia-topics");
  await section.getByText("Comprendre le modèle", { exact: true }).click();
  await expect(section.getByText(/Il utilise fastText/)).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Lire la fiche officielle du modèle" }),
  ).toHaveAttribute("href", /Language_agnostic_link-based_article_topic$/);
  await section
    .getByRole("button", { name: "Analyser les thématiques des articles" })
    .click();
  await expect(section.getByText("Articles examinés : 2 sur 2.")).toBeVisible();
  await expect(
    section.getByText(
      /Comptes ayant contribué : 2 sur 3 comptes retenus \(66,7 %\).*Articles distincts : 2.*Contributions observées : 3/,
    ),
  ).toBeVisible();
  const science = section
    .locator(".topic-bars li")
    .filter({ hasText: "Sciences et technologies" });
  await expect(science).toContainText("1 (50 %)");
  await section.getByLabel("Mesure du classement").selectOption("edits");
  await expect(science).toContainText("2 (66,7 %)");
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("creation");
  await expect(
    section.getByText(
      /Comptes ayant contribué : 1 sur 3 comptes retenus \(33,3 %\).*Articles distincts : 1.*Contributions observées : 1/,
    ),
  ).toBeVisible();
  await expect(science).toContainText("1 (100 %)");
  await section.getByLabel("Afficher les sous-thèmes").check();
  await expect(section.locator(".topic-bars")).toContainText("Physique");
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("modification");
  await expect(
    section.locator(".topic-bars li").filter({ hasText: "Physique" }),
  ).toContainText("1 (50 %)");
  expect(calls).toEqual([42, 43]);
  const csvDownload = page.waitForEvent("download");
  await section
    .getByRole("button", { name: "Exporter les statistiques thématiques CSV" })
    .click();
  const csv = await readFile(
    (await (await csvDownload).path()) as string,
    "utf8",
  );
  expect(csv).toContain("outlink-topic-model");
  expect(csv).toContain("period_start");
  const jsonDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const saved: Session = JSON.parse(
    await readFile((await (await jsonDownload).path()) as string, "utf8"),
  );
  expect(Object.keys(saved.article_topics!)).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".wikipedia-topics").analyze())
      .violations,
  ).toEqual([]);
  await mkdir("../output", { recursive: true });
  await page.screenshot({
    path: "../output/topics-mobile.png",
    fullPage: true,
  });
  await section.screenshot({ path: "../output/topics-panel-mobile.png" });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("both");
  await section.getByLabel("Afficher les sous-thèmes").uncheck();
  await page.screenshot({
    path: "../output/topics-desktop.png",
    fullPage: true,
  });
  await section.screenshot({ path: "../output/topics-panel-desktop.png" });
  await page.getByLabel("Langue", { exact: true }).selectOption("en");
  await expect(
    section.getByRole("heading", { name: "Wikipedia article topics, beta" }),
  ).toBeVisible();
  await expect(section.locator(".topic-bars")).toContainText(
    "Science and technology",
  );
  await page.getByLabel("Language", { exact: true }).selectOption("fr");
  await restore(page, saved);
  await page
    .locator(".wikipedia-topics")
    .getByRole("button", { name: "Analyser les thématiques des articles" })
    .click();
  await expect(
    page.locator(".wikipedia-topics").getByText("Articles examinés : 2 sur 2."),
  ).toBeVisible();
  expect(calls).toEqual([42, 43]);
});

test("model failures are separate from unclassified articles and retries preserve the denominator", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/article-topics", async (route) => {
    const body = route.request().postDataJSON();
    calls++;
    if (body.page_id === 42 && calls === 1)
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: '{"detail":"Source unavailable"}',
      });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: "frwiki",
        title: body.title,
        page_id: body.page_id,
        first_revision: 1,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-10-09T12:00:00Z",
        status: body.page_id === 42 ? "classified" : "unclassified",
        topics:
          body.page_id === 42 ? [{ topic: "STEM.Physics", score: 0.7 }] : [],
      }),
    });
  });
  await restore(page);
  const section = page.locator(".wikipedia-topics");
  await section
    .getByRole("button", { name: "Analyser les thématiques des articles" })
    .click();
  await expect(
    section.getByText(
      /Articles classés : 0 sur 2 \(0 %\).*Sans thème reconnu : 1.*Source indisponible : 1/,
    ),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Compléter l’analyse thématique" })
    .click();
  await expect(
    section.getByText(
      /Articles classés : 1 sur 2 \(50 %\).*Sans thème reconnu : 1.*Source indisponible : 0/,
    ),
  ).toBeVisible();
  await expect(section.locator(".topic-bars li")).toContainText("1 (50 %)");
  expect(calls).toBe(3);
});

test("pause preserves completed articles and resume skips their API calls", async ({
  page,
}) => {
  let blockedResolve: () => void = () => {};
  let secondRequested = false;
  const blocked = new Promise<void>((resolve) => {
    blockedResolve = resolve;
  });
  const calls: number[] = [];
  await model(page, async (id) => {
    calls.push(id);
    if (id === 43 && !secondRequested) {
      secondRequested = true;
      await blocked;
    }
  });
  await restore(page);
  const section = page.locator(".wikipedia-topics");
  await section
    .getByRole("button", { name: "Analyser les thématiques des articles" })
    .click();
  await expect(section.getByText("Articles examinés : 1 sur 2.")).toBeVisible();
  await expect.poll(() => secondRequested).toBe(true);
  await section
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await expect(
    section.getByRole("button", { name: "Compléter l’analyse thématique" }),
  ).toBeEnabled();
  blockedResolve();
  await section
    .getByRole("button", { name: "Compléter l’analyse thématique" })
    .click();
  await expect(section.getByText("Articles examinés : 2 sur 2.")).toBeVisible();
  expect(calls).toEqual([42, 43, 43]);
});

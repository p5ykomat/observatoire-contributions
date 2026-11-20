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
      name: "Analyse des thématiques des articles Wikipédia (bêta)",
    }),
  ).toBeVisible();
  await page.locator(".topics-disclosure > summary").click();
  await page.locator(".results-settings > summary").click();
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

test("article-only ranking reuses classifications, resets on request and preserves topic selection in JSON", async ({
  page,
}) => {
  const calls: number[] = [];
  await model(page, async (id) => {
    calls.push(id);
  });
  await restore(page);
  const section = page.locator(".wikipedia-topics");
  await expect(section.getByLabel("Mesure du classement")).toHaveCount(0);
  await section.getByText("Comprendre le modèle", { exact: true }).click();
  await expect(section.getByText(/Il utilise fastText/)).toBeVisible();
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("both");
  await section
    .getByRole("button", { name: "Analyser les thématiques", exact: true })
    .click();
  await expect(section.getByText("Articles examinés : 2 sur 2.")).toBeVisible();
  await expect(
    section.getByText(
      /Sélection : 2 articles distincts.*3 contributions de 2 comptes/,
    ),
  ).toBeVisible();
  const science = section
    .locator(".topic-bars li")
    .filter({ hasText: "Sciences et technologies" });
  await expect(science).toContainText("1 (50 %)");
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("creation");
  await expect(section.locator(".topic-bars")).toHaveCount(0);
  await section
    .getByRole("button", { name: "Analyser les thématiques", exact: true })
    .click();
  await expect(science).toContainText("1 (100 %)");
  expect(calls).toEqual([42, 43]);
  await section
    .getByRole("button", {
      name: "Recommencer l’analyse thématique à zéro",
      exact: true,
    })
    .click();
  await expect.poll(() => calls.length).toBe(3);
  await expect(science).toContainText("1 (100 %)");
  expect(calls).toEqual([42, 43, 42]);
  await section
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("modification");
  await section
    .getByRole("button", { name: "Analyser les thématiques", exact: true })
    .click();
  await expect(
    section.getByText(
      /Sélection : 2 articles distincts.*2 contributions de 2 comptes/,
    ),
  ).toBeVisible();
  expect(calls).toHaveLength(3);
  await section.getByLabel("Afficher les sous-thèmes").check();
  await expect(section.locator(".topic-bars")).toContainText("Physique");
  const csvDownload = page.waitForEvent("download");
  await section
    .getByRole("button", { name: "Exporter les statistiques thématiques CSV" })
    .click();
  const csv = await readFile((await (await csvDownload).path())!, "utf8");
  expect(csv).toContain("articles");
  expect(csv).toContain("modification");
  const jsonDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const saved = JSON.parse(
    await readFile((await (await jsonDownload).path())!, "utf8"),
  );
  expect(saved.article_topics_kind).toBe("modification");
  expect(Object.keys(saved.article_topics)).toHaveLength(2);
  await restore(page, saved);
  await expect(
    section.getByLabel("Créations ou modifications", { exact: true }),
  ).toHaveValue("modification");
  await section
    .getByRole("button", { name: "Analyser les thématiques", exact: true })
    .click();
  expect(calls).toHaveLength(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("both");
  await section
    .getByRole("button", { name: "Analyser les thématiques" })
    .click();
  await expect(
    section.getByText(
      /Articles classés : 0 sur 2 \(0 %\).*Sans thème reconnu : 1.*Source indisponible : 1/,
    ),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Réessayer les articles indisponibles" })
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
    .getByLabel("Créations ou modifications", { exact: true })
    .selectOption("both");
  await section
    .getByRole("button", { name: "Analyser les thématiques" })
    .click();
  await expect(section.getByText("Articles examinés : 1 sur 2.")).toBeVisible();
  await expect.poll(() => secondRequested).toBe(true);
  await section
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await expect(
    section.getByRole("button", {
      name: "Réessayer les articles indisponibles",
    }),
  ).toBeEnabled();
  blockedResolve();
  await section
    .getByRole("button", { name: "Réessayer les articles indisponibles" })
    .click();
  await expect(section.getByText("Articles examinés : 2 sur 2.")).toBeVisible();
  expect(calls).toEqual([42, 43, 43]);
});

test("contributor sorting and deleted-article filters update results and themes without collection", async ({
  page,
}) => {
  const s = fixture();
  s.deleted_collection_version = 1;
  s.cohort.forEach((a) => {
    a.deleted_complete = a.deleted_classified = true;
  });
  s.edits[2].timestamp = "2026-02-06T12:00:00Z";
  s.edits.push(
    {
      ...s.edits[0],
      username: "NoContribution",
      revision: 4,
      title: "Deleted article",
      page_id: null,
      deleted_page: true,
    },
    {
      ...s.edits[2],
      revision: 5,
      title: "Deleted article",
      page_id: null,
      deleted_page: true,
    },
  );
  const calls: number[] = [];
  await model(page, async (id) => {
    calls.push(id);
  });
  await restore(page, s);
  const list = page.locator(
    'section[aria-labelledby="contributor-list-title"]',
  );
  const section = page.locator(".wikipedia-topics");
  expect(
    await list.evaluate(
      (el) =>
        el.compareDocumentPosition(
          document.querySelector(".wikipedia-topics")!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBeTruthy();
  await expect(list.locator("details")).not.toHaveAttribute("open", "");
  await list.locator("summary").focus();
  await page.keyboard.press("Enter");
  const names = () => list.locator("tbody button.link").allTextContents();
  expect(await names()).toEqual([
    "TestAccountA",
    "TestAccountB",
    "NoContribution",
  ]);
  await list
    .getByRole("button", { name: "Trier par Contributions", exact: true })
    .click();
  await expect(
    list.getByRole("columnheader", { name: /Contributions/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  expect(await names()).toEqual([
    "NoContribution",
    "TestAccountA",
    "TestAccountB",
  ]);
  await list
    .getByRole("button", {
      name: "Trier par Dernière contribution",
      exact: true,
    })
    .click();
  expect((await names())[0]).toBe("TestAccountB");
  await list
    .getByRole("button", {
      name: "Trier par Dernière contribution",
      exact: true,
    })
    .click();
  expect((await names()).at(-1)).toBe("TestAccountB");
  await expect(
    section.getByLabel("Créations ou modifications", { exact: true }),
  ).toHaveValue("creation");
  await section
    .getByRole("button", { name: "Analyser les thématiques" })
    .click();
  await expect(section.getByText("Articles examinés : 1 sur 1.")).toBeVisible();
  await expect(
    section.getByText(/article.*supprimé.*sans thématique/),
  ).toBeVisible();
  await expect(
    section
      .locator(".topic-bars li")
      .filter({ hasText: "Sciences et technologies" }),
  ).toContainText("1 (50 %)");
  const creation = page.getByLabel(
    "Inclure les créations d’articles ensuite supprimés",
    { exact: true },
  );
  const modifications = page.getByLabel(
    "Inclure les modifications sur des articles ensuite supprimés",
    { exact: true },
  );
  await expect(creation).toBeChecked();
  await expect(modifications).toBeChecked();
  await creation.uncheck();
  await section
    .getByRole("button", { name: "Analyser les thématiques", exact: true })
    .click();
  expect(await names()).not.toContain("NoContribution");
  await expect(
    section
      .locator(".topic-bars li")
      .filter({ hasText: "Sciences et technologies" }),
  ).toContainText("1 (100 %)");
  await modifications.uncheck();
  await expect(
    list
      .locator("tbody tr")
      .filter({ hasText: "TestAccountB" })
      .locator('td[data-label="Contributions"]'),
  ).toHaveText("1");
  await creation.check();
  await modifications.check();
  expect(await names()).toContain("NoContribution");
  expect(calls).toEqual([42]);
  await mkdir("../output", { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "../output/deleted-results-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("creation-only analysis uses the first observed revision to resolve old XTools data", async ({
  page,
}) => {
  const s = fixture();
  s.edits[0].new_page = s.edits[1].new_page = null;
  const revisions: number[] = [];
  await page.route("**/api/article-topics", async (route) => {
    const body = route.request().postDataJSON();
    revisions.push(body.creation_revision);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project: "frwiki",
        title: body.title,
        page_id: 42,
        first_revision: 1,
        model: "outlink-topic-model",
        threshold: 0.5,
        fetched_at: "2026-10-09T12:00:00Z",
        status: "classified",
        topics: [{ topic: "STEM.Physics", score: 0.7 }],
      }),
    });
  });
  await restore(page, s);
  await page
    .locator(".wikipedia-topics")
    .getByRole("button", { name: "Analyser les thématiques" })
    .click();
  await expect(page.getByText("Articles examinés : 1 sur 1.")).toBeVisible();
  expect(revisions).toEqual([1]);
});

test("a Lift Wing outage leaves retention counts, filters and exports usable", async ({
  page,
}) => {
  const s = fixture();
  let modelCalls = 0;
  const collectionCalls: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/(global-contributions|contributions|deleted-contributions)\b/.test(
        request.url(),
      )
    )
      collectionCalls.push(request.url());
  });
  await page.route("**/api/article-topics", async (route) => {
    modelCalls++;
    await route.fulfill({
      status: 503,
      json: { provider: "liftwing", retry_after: 0 },
    });
  });
  await restore(page, s);
  const section = page.locator(".wikipedia-topics");
  await section
    .getByRole("button", { name: "Analyser les thématiques" })
    .click();
  await page.getByRole("button", { name: "J+30", exact: true }).click();
  await expect(section.getByText(/Source indisponible : 1/)).toBeVisible({
    timeout: 15000,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const exported = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(exported.results).toMatchObject({
    active: 2,
    inactive: 1,
    complete: true,
    totalEdits: 3,
  });
  expect(exported.question.days).toBe(30);
  expect(
    exported.cohort.every(
      (a: { warnings: string[] }) => a.warnings.length === 0,
    ),
  ).toBe(true);
  expect(collectionCalls).toEqual([]);
  expect(modelCalls).toBe(4);
});

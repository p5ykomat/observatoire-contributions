import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const projects = [
  ["frwiki", "fr.wikipedia.org", "wikipedia"],
  ["enwiki", "en.wikipedia.org", "wikipedia"],
  ["dewiki", "de.wikipedia.org", "wikipedia"],
  ["commonswiki", "commons.wikimedia.org", "commons"],
  ["wikidatawiki", "www.wikidata.org", "wikidata"],
  ["frwikisource", "fr.wikisource.org", "wikisource"],
].map(([id, domain, family]) => ({ id, domain, label: domain, family }));

async function mocks(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON() ?? {};
    let data: unknown = {};
    if (path === "/api/new-accounts")
      data = {
        candidates:
          body.action === "create"
            ? [
                {
                  name: "NewRegistered",
                  local_id: 1,
                  log_id: 1,
                  timestamp: "2026-01-13T12:00:00Z",
                },
                {
                  name: "NoEdits",
                  local_id: 2,
                  log_id: 2,
                  timestamp: "2026-01-13T12:00:00Z",
                },
              ]
            : [],
        unavailable: 0,
        cursor: null,
      };
    else if (path === "/api/new-accounts/verify")
      data = {
        accounts: body.candidates.map(
          (c: { name: string; local_id: number; timestamp: string }) => ({
            username: c.name,
            registration: c.timestamp,
            global_id: c.local_id,
            signup: {
              timestamp: c.timestamp,
              local_id: c.local_id,
              original_name: c.name,
            },
            bot: false,
            groups: [],
          }),
        ),
        unavailable: [],
        excluded: 0,
      };
    else if (path === "/api/qualify")
      data = body.usernames.map((username: string) => ({
        username,
        registration: "2026-01-13T12:00:00Z",
        exists: true,
        bot: false,
        groups: [],
      }));
    else if (path === "/api/projects") data = projects;
    else if (path === "/api/taxonomy")
      data = {
        version: "1.0",
        community_suffix: "talk",
        maintenance: ["Template", "Category", "Module"],
        families: { wikipedia: { "": "CONTENT" } },
        projects: {},
        default: "OTHER",
      };
    else if (path === "/api/local-accounts")
      data = {
        merged:
          body.usernames[0] === "NewRegistered"
            ? [
                { wiki: "frwiki", editcount: 5 },
                { wiki: "commonswiki", editcount: 2 },
                { wiki: "frwikisource", editcount: 1 },
              ]
            : [],
      };
    else if (path.startsWith("/api/namespaces/"))
      data = {
        project: projects.find((p) => p.id === path.split("/").at(-1)),
        namespaces: { "0": { id: 0, canonical: "", name: "" } },
      };
    else if (path === "/api/contributions")
      data = {
        contributions: body.usernames.map((username: string) => ({
          username,
          project: body.project,
          revision: 1,
          timestamp: "2026-03-20T10:00:00Z",
          namespace: 0,
          title: "Public page",
          tags: [],
          automation: "normal",
          provider: "mediawiki",
        })),
        cursor: null,
      };
    else if (path.includes("global-contributions"))
      throw new Error("This module should query MediaWiki directly");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

async function importAccounts(page: Page) {
  await page.goto("/");
  await page
    .getByText("Choisir les dates de création", { exact: true })
    .click();
  await page.getByLabel("Comptes créés le", { exact: true }).fill("2026-01-13");
  await page
    .getByRole("button", { name: "Charger les nouveaux comptes" })
    .click();
  await expect(
    page.getByText("2 comptes identifiables chargés.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyser ces comptes" }).click();
  await page
    .getByRole("button", { name: "Vérifier les comptes et continuer" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paramétrer", exact: true }),
  ).toBeVisible();
}

test("complete registration flow, Commons only, zero edits, textual report and accessible results", async ({
  page,
}) => {
  await mocks(page);
  await importAccounts(page);
  await expect(
    page.getByText("Date de fin de l’action", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Pendant une période précise", { exact: true }).check();
  await page
    .getByLabel("Contributions à partir du", { exact: true })
    .fill("2026-03-01");
  await page
    .getByLabel("Contributions jusqu’au", { exact: true })
    .fill("2026-03-30");
  for (const label of [
    "Wikipédia en français",
    "Wikipédia en anglais",
    "Wikipédia en allemand",
    "Wikidata",
  ]) {
    const checkbox = page.getByRole("checkbox", { name: label, exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
  }
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bilan de l’observation" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Parmi les 2 comptes retenus.*1 \(50 %\)/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "NewRegistered", exact: true }),
  ).toBeVisible();
  await page.locator("#contributor-list-view").selectOption("all");
  await expect(
    page.getByRole("button", { name: "NoEdits", exact: true }),
  ).toBeVisible();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
  await mkdir("../output", { recursive: true });
  await page.screenshot({
    path: "../output/new-accounts-results-desktop.png",
    fullPage: true,
  });
});

test("all projects and all languages, custom Wikisource selection, keyboard and mobile reflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await importAccounts(page);
  await page
    .getByLabel("Tous les projets Wikimédia, toutes les langues", {
      exact: true,
    })
    .check();
  await expect(
    page.getByText(/6 projets publics du catalogue seront observés/),
  ).toBeVisible();
  await page
    .getByLabel("Sélection personnalisée par projet et langue", { exact: true })
    .check();
  await page
    .getByRole("textbox", { name: "Rechercher un projet" })
    .fill("wikisource");
  await page.getByRole("checkbox", { name: /fr.wikisource.org/ }).check();
  await expect(
    page.getByRole("checkbox", { name: /fr.wikisource.org/ }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("../output", { recursive: true });
  await page.screenshot({
    path: "../output/new-accounts-settings-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("saved cohort CSV imports through the main file input without querying the registration log again", async ({
  page,
}) => {
  await mocks(page);
  const logRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/new-accounts")
      logRequests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByText("Choisir les dates de création", { exact: true })
    .click();
  await page.getByLabel("Une plage de dates", { exact: true }).check();
  await page
    .getByLabel("Comptes créés à partir du", { exact: true })
    .fill("2026-01-01");
  await page
    .getByLabel("Comptes créés jusqu’au", { exact: true })
    .fill("2026-01-30");
  await page
    .getByRole("button", { name: "Charger les nouveaux comptes" })
    .click();
  await expect(
    page.getByText("2 comptes identifiables chargés.", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter la liste CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "nouveaux-comptes-frwiki_2026-01-01_2026-01-30.csv",
  );
  await mkdir("../output", { recursive: true });
  await download.saveAs("../output/" + download.suggestedFilename());
  const requestsBefore = logRequests.length;
  await page.reload();
  await page
    .locator('input[type="file"][accept=".txt,.csv"]')
    .setInputFiles("../output/" + download.suggestedFilename());
  await expect(
    page.getByRole("heading", { name: "Participants importés", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Vérifier les comptes et continuer" })
    .click();
  await expect(
    page.getByText(
      "Comptes créés sur Wikipédia en français du 2026-01-01 au 2026-01-30.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Pendant une période précise", { exact: true }).check();
  await page
    .getByLabel("Contributions à partir du", { exact: true })
    .fill("2026-03-01");
  await page
    .getByLabel("Contributions jusqu’au", { exact: true })
    .fill("2026-03-30");
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bilan de l’observation" }),
  ).toBeVisible();
  expect(logRequests).toHaveLength(requestsBefore);
});

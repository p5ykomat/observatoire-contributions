import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
const projects = [
  {
    id: "frwiki",
    domain: "fr.wikipedia.org",
    label: "fr.wikipedia.org",
    family: "wikipedia",
  },
  {
    id: "commonswiki",
    domain: "commons.wikimedia.org",
    label: "commons.wikimedia.org",
    family: "commons",
  },
  {
    id: "wikidatawiki",
    domain: "www.wikidata.org",
    label: "www.wikidata.org",
    family: "wikidata",
  },
];
async function mocks(page: Page, delay = 0) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() ?? {};
    if (delay && path.includes("contributions"))
      await new Promise((r) => setTimeout(r, delay));
    let data: unknown = {};
    if (path === "/api/projects") data = projects;
    else if (path === "/api/taxonomy")
      data = {
        version: "1.0",
        community_suffix: "talk",
        maintenance: ["Template", "Category", "Module"],
        families: { wikipedia: { "": "CONTENT" } },
        projects: {
          commonswiki: { File: "MEDIA" },
          wikidatawiki: { "": "STRUCTURED_DATA" },
        },
        default: "OTHER",
      };
    else if (path === "/api/qualify")
      data = body.usernames.map((username: string) => ({
        username,
        registration: "2020-12-30T00:00:00Z",
        global_id: 1,
        global_editcount: 7,
        groups: username === "Machine" ? ["global-bot"] : [],
        locked: false,
        exists: username !== "Absent",
        bot: username === "Machine",
      }));
    else if (path.startsWith("/api/namespaces/"))
      data = {
        project: projects.find((p) => p.id === path.split("/").at(-1)),
        namespaces: {
          "0": { id: 0, canonical: "", name: "" },
          "6": { id: 6, canonical: "File", name: "Fichier" },
        },
      };
    else if (path === "/api/global-contributions")
      data = {
        rows: [
          {
            username: body.username,
            project: "fr.wikipedia.org",
            rev_id: body.username === "Alice" ? 1 : 3,
            timestamp: "2021-01-04T12:00:00Z",
            namespace: 0,
            page_title: "Article",
          },
          {
            username: body.username,
            project: "commons.wikimedia.org",
            rev_id: body.username === "Alice" ? 2 : 4,
            timestamp: "2022-02-02T12:00:00Z",
            namespace: 6,
            page_title: "Photographie",
          },
        ],
        cursor: null,
      };
    else if (path === "/api/local-accounts")
      data = { merged: [{ wiki: "frwiki", editcount: 7 }] };
    else if (path === "/api/contributions")
      data = {
        contributions: body.usernames.map((username: string) => ({
          username,
          project: body.project,
          revision: username === "Alice" ? 10 : 11,
          timestamp: "2021-01-04T12:00:00Z",
          namespace: 0,
          title: "Article",
          category: "OTHER",
          automation: "normal",
          tags: [],
          provider: "mediawiki",
        })),
        cursor: null,
      };
    else if (path === "/api/dashboard")
      data = {
        title: "Formation test",
        start: "2021-01-01",
        end: "2021-01-02",
        home_wiki: { language: "fr", project: "wikipedia" },
        participants: [
          {
            username: "Alice",
            roles: ["0"],
            staff: false,
            included: true,
            role_conflict: false,
          },
          {
            username: "Staff",
            roles: ["0", "1"],
            staff: true,
            included: false,
            role_conflict: true,
          },
        ],
      };
    await route.fulfill({ json: data });
  });
}
async function imported(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Noms d’utilisateur, un par ligne")
    .fill("Alice\nBob\nAlice\nMachine\nAbsent");
  await page
    .getByRole("button", { name: "Importer la cohorte", exact: true })
    .click();
  await page
    .getByLabel("Titre de l’action", { exact: true })
    .fill("Atelier de janvier");
  await page
    .getByRole("button", {
      name: "Vérifier les comptes et continuer",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paramétrer", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2021-01-01");
  await page.getByLabel("Fin de l’action", { exact: true }).fill("2021-01-02");
}
async function analyzed(page: Page) {
  await imported(page);
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Atelier de janvier", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
}
test("parcours complet, exclusions, graphiques, exports et recalcul sans réseau", async ({
  page,
}) => {
  await mocks(page);
  await analyzed(page);
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("4", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chart-canvas svg")).toHaveCount(2);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.push(r.url());
  });
  await page.getByLabel("Exclure Alice", { exact: true }).check();
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("2", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByLabel("Exclure Alice", { exact: true }).uncheck();
  for (const name of [
    "Exporter le CSV détaillé",
    "Exporter la synthèse CSV",
    "Exporter l’analyse JSON",
    "Exporter le rapport PDF",
  ]) {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).first().click();
    const download = await promise;
    await mkdir("../output", { recursive: true });
    await download.saveAs("../output/" + download.suggestedFilename());
  }
  for (const name of ["Télécharger en PNG", "Télécharger en SVG"]) {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).first().click();
    await (
      await promise
    ).saveAs("../output/" + (name.includes("PNG") ? "chart.png" : "chart.svg"));
  }
  await page.getByRole("button", { name: "Alice", exact: true }).click();
  await expect(page.locator(".individual")).toBeVisible();
  await page.getByRole("button", { name: "Fermer la fiche" }).click();
  await page.screenshot({
    path: "../output/results-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("CSV avec sélection de colonne, aperçu et qualification", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/");
  await page.getByLabel("Importer un fichier TXT ou CSV").setInputFiles({
    name: "cohorte.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("groupe;compte\nA;Alice\nB;Bob"),
  });
  await page.getByLabel("Colonne des noms d’utilisateur").selectOption("1");
  await page
    .getByRole("button", { name: "Importer la cohorte", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("rowheader", { name: "Alice", exact: true }),
  ).toBeVisible();
});

test("cinq étapes, vérification intégrée à l’import et bilan consultable", async ({
  page,
}) => {
  await mocks(page);
  const contributionCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("contributions"))
      contributionCalls.push(request.url());
  });
  await imported(page);
  const nav = page.locator("nav");
  await expect(nav.getByRole("button")).toHaveText([
    "1Importer",
    "2Paramétrer",
    "3Collecter",
    "4Résultats",
    "5Méthodologie",
  ]);
  await expect(
    nav.getByRole("button", { name: "2 Paramétrer" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Vérification terminée. Comptes vérifiés : 4. Comptes exclus de l’analyse : 2.",
    }),
  ).toBeVisible();
  expect(contributionCalls).toHaveLength(0);
  await nav.getByRole("button", { name: "1 Importer" }).click();
  await expect(
    page.getByRole("heading", { name: "Participants importés", exact: true }),
  ).toBeVisible();
  const alice = page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Alice", exact: true }),
  });
  await expect(alice.getByText("2020-12-30", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Exclure Machine", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Exclure Absent", { exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: "../output/import-verified-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../output/import-verified-mobile.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Modifier la liste importée", exact: true })
    .click();
  await expect(
    page.getByLabel("Noms d’utilisateur, un par ligne"),
  ).toBeVisible();
  await expect(nav.getByRole("button").first()).toHaveAttribute(
    "aria-current",
    "step",
  );
});

test("vérification indisponible reste dans l’import puis permet de réessayer", async ({
  page,
}) => {
  await mocks(page);
  await page.route("**/api/qualify", async (route) =>
    route.fulfill({ status: 404, json: { detail: "Indisponible" } }),
  );
  await page.goto("/");
  await page.getByLabel("Noms d’utilisateur, un par ligne").fill("Alice");
  await page
    .getByRole("button", { name: "Importer la cohorte", exact: true })
    .click();
  // Opening Paramétrer must also verify pending accounts, without bypassing the check.
  await page
    .locator("nav")
    .getByRole("button", { name: "2 Paramétrer" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "La vérification reste incomplète pour 1 compte non exclu",
  );
  await expect(
    page.getByRole("heading", { name: "Participants importés", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Paramétrer", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/qualify");
  await page
    .getByRole("button", {
      name: "Vérifier les comptes et continuer",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paramétrer", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "1 Importer" }).click();
  await page
    .getByRole("button", { name: "Déplier les détails", exact: true })
    .click();
  await expect(page.getByText("Compte vérifié", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Vérification indisponible", { exact: true }),
  ).toHaveCount(0);
});
test("Dashboard, staff exclu et réintégrable, conflit visible", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/");
  await page
    .getByLabel("URL du programme Dashboard")
    .fill("https://outreachdashboard.wmflabs.org/courses/Org/Atelier");
  await page.getByRole("button", { name: "Importer le programme" }).click();
  await expect(page.getByLabel("Titre de l’action")).toHaveValue(
    "Formation test",
  );
  await expect(page.getByLabel("Exclure Staff")).toBeChecked();
  await expect(
    page.getByText("Conflit de rôles", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Exclure Staff").uncheck();
  await expect(page.getByLabel("Exclure Staff")).not.toBeChecked();
});
test("archivage puis restauration locale et effacement", async ({ page }) => {
  await mocks(page);
  await analyzed(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  await page
    .getByRole("button", { name: "Effacer les données de cette analyse" })
    .click();
  await page
    .getByRole("button", {
      name: "Commencer une nouvelle analyse",
      exact: true,
    })
    .click();
  let contributions = 0;
  page.on("request", (r) => {
    if (r.url().includes("contributions")) contributions++;
  });
  await page
    .getByLabel("Importer une analyse JSON", { exact: true })
    .setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Atelier de janvier", exact: true }),
  ).toBeVisible();
  expect(contributions).toBe(0);
});
test("pause, reprise et annulation gardent les données", async ({ page }) => {
  await mocks(page, 800);
  await imported(page);
  await page.getByRole("button", { name: "Lancer la collecte" }).click();
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await expect(
    page.getByRole("button", { name: "Reprendre la collecte" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reprendre la collecte" }).click();
  await page
    .getByRole("button", { name: "Annuler et consulter les données" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Atelier de janvier" }),
  ).toBeVisible();
  await expect(
    page.getByText("La collecte est incomplète.", { exact: false }).first(),
  ).toBeVisible();
});
test("Observatoire uniquement, mobile, clavier et accessibilité", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/");
  await expect(page.locator(".app")).toHaveClass("app theme-2");
  await expect(
    page.getByText("Comparer les directions visuelles", { exact: true }),
  ).toHaveCount(0);
  await mkdir("../output", { recursive: true });
  await page.screenshot({
    path: "../output/observatoire-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../output/import-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});

test("paramétrage simplifié, fenêtre conditionnelle et catégories expliquées", async ({
  page,
}) => {
  await mocks(page);
  await imported(page);
  await expect(
    page.getByLabel("Participants retenus", { exact: true }),
  ).toHaveValue("all");
  await expect(
    page.getByLabel("Préréglage de création", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Jours d’observation avant l’action", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Participants retenus", { exact: true })
    .selectOption("new");
  await expect(
    page.getByLabel("Préréglage de création", { exact: true }),
  ).toHaveValue("2");
  await expect(page.getByLabel("Jours avant", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Préréglage de création", { exact: true })
    .selectOption("1");
  await expect(
    page.getByText(
      "Comptes considérés comme nouveaux : créés du 2020-12-25 au 2021-01-01 inclus",
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Préréglage de création", { exact: true })
    .selectOption("custom");
  await page
    .getByLabel("Compte créé à partir du", { exact: true })
    .fill("2020-12-29");
  await page
    .getByLabel("Compte créé jusqu’au (inclus)", { exact: true })
    .fill("2021-01-03");
  await expect(
    page.getByText(
      "Comptes considérés comme nouveaux : créés du 2020-12-29 au 2021-01-03 inclus",
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await page
    .getByLabel("Participants retenus", { exact: true })
    .selectOption("all");
  await expect(
    page.getByLabel("Préréglage de création", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Participants retenus", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await expect(
    page.getByText(
      "Les échéances et types de modifications se choisissent dans Résultats. Commons, Wikidata et les autres projets y sont comptés avec toutes leurs catégories.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/settings-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Participants retenus", { exact: true })
    .selectOption("new");
  await page
    .getByLabel("Préréglage de création", { exact: true })
    .selectOption("custom");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../output/settings-mobile.png",
    fullPage: true,
  });
});

test("projets regroupés par famille, langues recherchables et sélection complète", async ({
  page,
}) => {
  await mocks(page);
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      json: [
        ...projects,
        {
          id: "enwiki",
          domain: "en.wikipedia.org",
          label: "en.wikipedia.org",
          family: "wikipedia",
        },
        {
          id: "frwiktionary",
          domain: "fr.wiktionary.org",
          label: "fr.wiktionary.org",
          family: "wiktionary",
        },
        {
          id: "enwiktionary",
          domain: "en.wiktionary.org",
          label: "en.wiktionary.org",
          family: "wiktionary",
        },
      ],
    }),
  );
  await imported(page);
  await page
    .getByRole("combobox", { name: "Périmètre de collecte", exact: true })
    .selectOption("custom");
  const picker = page.getByRole("group", {
    name: "Projets à analyser",
    exact: true,
  });
  await picker.locator("summary").filter({ hasText: "Wikipédia" }).click();
  await expect(
    picker.getByRole("checkbox", { name: /Français \(fr\)/i }),
  ).toBeChecked();
  await picker.getByRole("checkbox", { name: /Anglais \(en\)/i }).check();
  await picker
    .getByRole("button", {
      name: "Effacer la sélection de Wikipédia",
      exact: true,
    })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /Français \(fr\)/i }),
  ).not.toBeChecked();
  await picker
    .getByRole("button", {
      name: "Sélectionner toutes les éditions de Wikipédia",
      exact: true,
    })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /Anglais \(en\)/i }),
  ).toBeChecked();
  await picker
    .getByLabel("Rechercher un projet", { exact: true })
    .fill("anglais");
  await expect(
    picker.getByRole("checkbox", { name: /Anglais \(en\)/i }),
  ).toHaveCount(2);
  await expect(
    picker.getByRole("checkbox", { name: /Français \(fr\)/i }),
  ).toHaveCount(0);
  await picker
    .locator("details")
    .filter({ hasText: "Wiktionnaire" })
    .getByRole("checkbox")
    .check();
  await expect(picker.getByRole("status")).toContainText("5");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("733 comptes paginés, exclusions réversibles et détails sans défilement horizontal", async ({
  page,
}) => {
  await mocks(page);
  await page.route("**/api/dashboard", async (route) =>
    route.fulfill({
      json: {
        title: "Programme récent",
        start: "2025-01-01",
        end: "2025-01-02",
        home_wiki: { language: "fr", project: "wikipedia" },
        participants: Array.from({ length: 733 }, (_, i) => ({
          username: "Compte" + String(i).padStart(3, "0"),
          staff: i === 0,
          included: i !== 0,
          roles: [i === 0 ? "1" : "0"],
        })),
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("URL du programme Dashboard")
    .fill("https://outreachdashboard.wmflabs.org/courses/Org/Recent");
  await page
    .getByRole("button", { name: "Importer le programme", exact: true })
    .click();
  await expect(page.locator(".qualification-table tbody tr")).toHaveCount(25);
  await expect(
    page.getByLabel("Exclure Compte000", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Exclure Compte001", { exact: true }).check();
  await expect(
    page.getByText("733 comptes importés : 731 non exclus et 2 exclus.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Exclure Compte001", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(
    page.getByRole("rowheader", { name: "Compte025", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Rechercher un compte", { exact: true })
    .fill("Compte000");
  await expect(page.locator(".qualification-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Déplier les détails", exact: true })
    .click();
  await expect(
    page.getByLabel("Motif d’exclusion Compte000", { exact: true }),
  ).toBeVisible();
  const fits = () =>
    page
      .locator(".qualification-table")
      .evaluate((table) => table.scrollWidth <= table.clientWidth);
  expect(await fits()).toBe(true);
  await page.screenshot({
    path: "../output/participants-desktop.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await fits()).toBe(true);
  await page.screenshot({
    path: "../output/participants-mobile.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("nouvelle analyse arrête la collecte et efface les anciens résultats", async ({
  page,
}) => {
  await mocks(page, 800);
  await imported(page);
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nouvelle analyse", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nouvelle analyse", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Conserver cette analyse", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Nouvelle analyse", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Commencer une nouvelle analyse",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Suivez une cohorte dans le temps, sur ses projets d’origine et dans tout l’écosystème Wikimédia.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Noms d’utilisateur, un par ligne", { exact: true }),
  ).toHaveValue("");
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("heading", { name: "Atelier de janvier", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.locator("nav button").filter({ hasText: "Résultats" }),
  ).toBeDisabled();
});

test("anglais et retour français conservent l’analyse, ses totaux et ses appels réseau", async ({
  page,
}) => {
  await mocks(page);
  await analyzed(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) calls.push(request.url());
  });
  await page.getByLabel("Langue", { exact: true }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Wikimedia Retention");
  await expect(
    page.getByRole("heading", {
      name: "Who contributed in this period?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Observed eligible contributions" })
      .getByText("4", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Verification complete." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Exclude Machine", { exact: true }),
  ).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../output/results-en-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Language", { exact: true }).selectOption("fr");
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("4", { exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByLabel("Langue", { exact: true }).selectOption("en");
  await page.reload();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
});

test("graphiques expliqués, pourcentages avec dénominateurs et groupes retirés", async ({
  page,
}) => {
  await mocks(page);
  await analyzed(page);
  await expect(
    page.getByRole("heading", { name: "Comparaison des groupes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Matrice des migrations", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Filtrer par groupe", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "J+30", exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Période analysée : du 2021-01-03 au 2021-02-01 inclus",
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("2", { exact: true }),
  ).toBeVisible();
  const project = page.locator(".chart").filter({
    has: page.getByRole("heading", {
      name: "Combien de personnes contribuent sur chaque projet ?",
      exact: true,
    }),
  });
  await project
    .getByText("Afficher les valeurs du graphique", { exact: true })
    .click();
  await expect(
    project.getByRole("row").filter({ hasText: "Wikipédia" }).getByRole("cell"),
  ).toHaveText("2");
  await project
    .getByRole("button", { name: "Pourcentages", exact: true })
    .click();
  await expect(
    project.getByRole("row").filter({ hasText: "Wikipédia" }).getByRole("cell"),
  ).toHaveText("100 %");
  await expect(
    project.getByText("Pourcentage des 2 participants retenus.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "J+90", exact: true }).click();
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("2", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nombre de jours personnalisé après la fin de l’événement", {
      exact: true,
    })
    .fill("400");
  await expect(
    page
      .locator(".kpis > div")
      .filter({ hasText: "Contributions éligibles observées" })
      .getByText("4", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await expect(
    page.getByText(
      "Ce bilan ne signifie pas que la personne contribue encore le dernier jour.",
      { exact: false },
    ),
  ).toBeVisible();
});

test("dates modifiables dans Paramétrer sans modifier le Dashboard ni collecter", async ({
  page,
}) => {
  await mocks(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      calls.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await page
    .getByLabel("URL du programme Dashboard")
    .fill("https://outreachdashboard.wmflabs.org/courses/Org/Lille");
  await page
    .getByRole("button", { name: "Importer le programme", exact: true })
    .click();
  await expect(
    page.getByText("Dates fournies par le Dashboard", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Vérifier les comptes et continuer",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paramétrer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Dates fournies par le Dashboard", { exact: false }),
  ).toHaveCount(1);
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2026-02-26");
  await page.getByLabel("Fin de l’action", { exact: true }).fill("2026-07-01");
  await expect(
    page.getByLabel("Non, saisir les dates réelles ci-dessous", {
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByText("aucun droit d’administration n’est nécessaire", {
      exact: false,
    }),
  ).toBeVisible();
  const radio = page.getByLabel("Non, saisir les dates réelles ci-dessous", {
    exact: true,
  });
  const box = await radio.boundingBox();
  expect(box!.width).toBeLessThan(25);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(calls.filter((path) => path === "/api/dashboard")).toHaveLength(1);
  expect(calls.filter((path) => path.includes("contributions"))).toHaveLength(
    0,
  );
});

test("dates Dashboard futures à remplacer et nouveaux comptes retenus avec la bonne action", async ({
  page,
}) => {
  await mocks(page);
  const dates = [
    "2014-04-23",
    "2026-04-03",
    "2026-03-29",
    "2024-07-28",
    "2025-12-24",
    "2026-04-03",
    "2026-03-31",
    "2026-04-02",
    "2022-12-29",
    "2008-03-28",
    "2026-03-27",
    "2026-04-02",
    "2026-04-03",
    "2026-03-26",
    "2026-04-02",
    "2026-04-17",
    "2026-04-01",
    "2026-04-03",
  ];
  const staff = [0, 8, 9];
  await page.route("**/api/dashboard", async (route) =>
    route.fulfill({
      json: {
        title: "Formation de Lille",
        start: "2026-02-26T23:00:00Z",
        end: "2052-02-27T23:00:00Z",
        home_wiki: { language: "fr", project: "wikipedia" },
        participants: dates.map((_, i) => ({
          username: "Compte" + i,
          staff: staff.includes(i),
          included: !staff.includes(i),
          roles: [staff.includes(i) ? "1" : "0"],
        })),
      },
    }),
  );
  await page.route("**/api/qualify", async (route) =>
    route.fulfill({
      json: route
        .request()
        .postDataJSON()
        .usernames.map((username: string) => ({
          username,
          registration: dates[Number(username.slice(6))] + "T12:00:00Z",
          exists: true,
          bot: false,
          groups: [],
        })),
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("URL du programme Dashboard")
    .fill("https://outreachdashboard.wmflabs.org/courses/Org/Lille");
  await page
    .getByRole("button", { name: "Importer le programme", exact: true })
    .click();
  await expect(
    page.getByText("Dates fournies par le Dashboard", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Le programme Dashboard indique une date de fin future", {
      exact: false,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Vérifier les comptes et continuer",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Oui, utiliser ces dates", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Début de l’action", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Confirmez ou remplacez les dates",
  );
  await page
    .getByLabel("Non, saisir les dates réelles ci-dessous", { exact: true })
    .check();
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2026-04-03");
  await page.getByLabel("Fin de l’action", { exact: true }).fill("2026-04-03");
  await page
    .getByLabel("Participants retenus", { exact: true })
    .selectOption("new");
  await page
    .getByLabel("Préréglage de création", { exact: true })
    .selectOption("custom");
  await page
    .getByLabel("Compte créé à partir du", { exact: true })
    .fill("2026-03-20");
  await page
    .getByLabel("Compte créé jusqu’au (inclus)", { exact: true })
    .fill("2026-04-13");
  await expect(
    page.getByText(
      "Comptes considérés comme nouveaux : créés du 2026-03-20 au 2026-04-13 inclus",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({
      hasText: "Sélection avant collecte : 12 comptes retenus sur 15",
    }),
  ).toBeVisible();
  await page
    .getByLabel("Préréglage de création", { exact: true })
    .selectOption("2");
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2026-02-26");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Sélection avant collecte : 0 comptes retenus" }),
  ).toBeVisible();
  await page
    .getByText("Voir les comptes retenus et les motifs de non-sélection", {
      exact: true,
    })
    .first()
    .click();
  const selection = page.locator(".selection-review");
  await expect(
    selection.getByRole("row").filter({ hasText: "Compte1" }).first(),
  ).toContainText("après la fenêtre");
  const contributions: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("contributions"))
      contributions.push(request.url());
  });
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Aucun compte ne correspond",
  );
  expect(contributions).toHaveLength(0);
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2026-04-03");
  await page
    .getByLabel("Participants retenus", { exact: true })
    .selectOption("all");
  await expect(
    page.getByRole("status").filter({
      hasText: "Sélection avant collecte : 15 comptes retenus sur 15",
    }),
  ).toBeVisible();
});

test("secours XTools affiché une seule fois avec le nombre de comptes", async ({
  page,
}) => {
  await mocks(page);
  await page.route("**/api/global-contributions", async (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await analyzed(page);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "XTools n’a pas répondu pour 3 comptes" }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "XTools n’a pas répondu pour 3 comptes" }),
  ).toBeVisible();
  await page.getByLabel("Langue", { exact: true }).selectOption("en");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "XTools did not respond for 3 accounts" }),
  ).toHaveCount(1);
});

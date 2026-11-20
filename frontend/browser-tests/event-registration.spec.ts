import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import type { EventRegistrationSource, Session } from "../src/types";

const source: EventRegistrationSource = {
  id: 42,
  project: "metawiki",
  title: "Atelier CampaignEvents",
  url: "https://meta.wikimedia.org/wiki/Special:EventDetails/42",
  page_url: "https://meta.wikimedia.org/wiki/Event:Formation",
  start: "2026-02-26",
  end: "2052-02-27",
  starts_at: "2026-02-26T09:00:00Z",
  ends_at: "2052-02-27T17:00:00Z",
  timezone: "Europe/Paris",
  start_local: "2026-02-26 10:00",
  end_local: "2052-02-27 18:00",
  projects: ["frwiki"],
  all_projects: false,
  public_only: true,
  dates_confirmed: false,
  unavailable: 0,
  imported_at: "2026-10-09T12:00:00Z",
};
const projects = [
  {
    id: "metawiki",
    domain: "meta.wikimedia.org",
    family: "wikimedia",
    label: "Meta",
  },
  {
    id: "frwiki",
    domain: "fr.wikipedia.org",
    family: "wikipedia",
    label: "FR",
  },
  {
    id: "commonswiki",
    domain: "commons.wikimedia.org",
    family: "commons",
    label: "Commons",
  },
];
const publicAccount = (id: number) => ({
  username: `Public${String(id).padStart(2, "0")}`,
  global_id: id,
  roles: ["participant"],
  staff: false,
  included: true,
});

async function mocks(page: Page) {
  const accountPages: { kind: string; cursor: number | null }[] = [];
  const collected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() ?? {};
    let data: unknown;
    if (path === "/api/event-registration") data = source;
    else if (path === "/api/event-registration/accounts") {
      accountPages.push(body);
      if (body.kind === "participants")
        data =
          body.cursor === null
            ? {
                accounts: Array.from({ length: 20 }, (_, i) =>
                  publicAccount(i + 1),
                ),
                cursor: 20,
                unavailable: 0,
              }
            : body.cursor === 20
              ? {
                  accounts: Array.from({ length: 6 }, (_, i) =>
                    publicAccount(i + 21),
                  ),
                  cursor: 26,
                  unavailable: 0,
                }
              : { accounts: [], cursor: null, unavailable: 0 };
      else
        data =
          body.cursor === null
            ? {
                accounts: [
                  {
                    ...publicAccount(1),
                    roles: ["organizer"],
                    staff: true,
                    included: false,
                  },
                  {
                    username: "OrganizerOnly",
                    global_id: 100,
                    roles: ["organizer"],
                    staff: true,
                    included: false,
                  },
                ],
                cursor: 2,
                unavailable: 0,
              }
            : { accounts: [], cursor: null, unavailable: 0 };
    } else if (path === "/api/projects") data = projects;
    else if (path === "/api/qualify")
      data = body.usernames.map((username: string) => ({
        username,
        registration: "2026-01-01T10:00:00Z",
        exists: true,
        bot: false,
        groups: [],
      }));
    else if (path === "/api/taxonomy")
      data = {
        version: "1",
        community_suffix: "talk",
        maintenance: [],
        families: { wikipedia: { "": "CONTENT" } },
        projects: {},
        default: "OTHER",
      };
    else if (path === "/api/local-accounts")
      data = { merged: [{ wiki: "frwiki", editcount: 2 }] };
    else if (path.startsWith("/api/namespaces/"))
      data = {
        project: projects[1],
        namespaces: { "0": { id: 0, canonical: "" } },
      };
    else if (path === "/api/deleted-contributions")
      data = { contributions: [], cursor: null };
    else if (path === "/api/global-contributions") {
      collected.push(body.username);
      data = {
        rows:
          body.username === "Public02"
            ? [
                {
                  username: body.username,
                  project: "fr.wikipedia.org",
                  rev_id: 1,
                  timestamp: "2026-04-02T12:00:00Z",
                  namespace: 0,
                  page_title: "Article",
                },
              ]
            : [],
        cursor: null,
      };
    } else return route.fulfill({ status: 404, json: {} });
    await route.fulfill({ json: data });
  });
  return { accountPages, collected };
}

test("public Event Registration imports all pages, confirms real dates, excludes organizers and restores provenance", async ({
  page,
}) => {
  const { accountPages, collected } = await mocks(page);
  await page.goto("/");
  const importer = page.locator(
    'section[aria-labelledby="event-import-title"]',
  );
  await expect(
    importer.getByRole("link", { name: "Consulter l’API CampaignEvents" }),
  ).toHaveAttribute("href", /campaignevents.v0/);
  await importer
    .getByLabel("Lien de la page de l’événement ou de Special:EventDetails")
    .fill(source.page_url);
  await importer
    .getByRole("button", { name: "Charger les participants publics" })
    .click();
  await expect(
    importer.getByRole("button", { name: "Utiliser cette liste" }),
  ).toBeEnabled();
  expect(accountPages.map((p) => [p.kind, p.cursor])).toEqual([
    ["participants", null],
    ["participants", 20],
    ["participants", 26],
    ["organizers", null],
    ["organizers", 2],
  ]);
  await expect(
    page.getByText(/Event Registration indique un début/),
  ).toHaveCount(0);
  await importer.getByRole("button", { name: "Utiliser cette liste" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Exclure Public01", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Exclure OrganizerOnly", exact: true }),
  ).toBeChecked();
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
    page.getByText(/Event Registration indique un début/),
  ).toContainText("2052");
  await expect(
    page.getByLabel("Oui, utiliser ces dates", { exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Non, saisir les dates réelles ci-dessous", { exact: true })
    .check();
  await page
    .getByLabel("Début de l’action", { exact: true })
    .fill("2026-04-01");
  await page.getByLabel("Fin de l’action", { exact: true }).fill("2026-04-01");
  await page
    .getByRole("button", { name: "Lancer la collecte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: source.title, exact: true }),
  ).toBeVisible();
  expect(collected).toHaveLength(25);
  expect(collected).not.toContain("Public01");
  expect(collected).not.toContain("OrganizerOnly");
  const list = page.locator(
    'section[aria-labelledby="contributor-list-title"]',
  );
  await expect(list.locator("details")).not.toHaveAttribute("open", "");
  expect(await list.locator("tbody button.link").allTextContents()).toEqual([
    "Public02",
  ]);
  await list.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    list.getByRole("button", { name: "Public02", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/inscriptions privées ne font pas partie/),
  ).toBeVisible();
  await expect(page.getByText(/17 minutes/)).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const saved: Session = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.params.origins).toEqual(["frwiki"]);
  expect(saved.params.start).toBe("2026-04-01");
  expect(saved.event_registration).toMatchObject({
    end: "2052-02-27",
    dates_confirmed: true,
    public_only: true,
  });
  expect(saved.cohort[1].registration).toBe("2026-01-01T10:00:00Z");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("../output", { recursive: true });
  await page.screenshot({
    path: "../output/event-results-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    list.getByRole("button", { name: "Trier par Contributions", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await list.screenshot({ path: "../output/event-contributors-mobile.png" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const width of [320, 740, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      list.getByRole("button", {
        name: "Trier par Contributions",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.goto("/");
  await page.locator('input[accept=".json"]').setInputFiles({
    name: "analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page
    .getByRole("button", { name: "Paramétrer", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Non, saisir les dates réelles ci-dessous", {
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Début de l’action", { exact: true }),
  ).toHaveValue("2026-04-01");
});

test("Event Registration errors preserve imported pages and can be resumed", async ({
  page,
}) => {
  await mocks(page);
  let failed = false;
  const calls: (number | null)[] = [];
  await page.route("**/api/event-registration/accounts", async (route) => {
    const body = route.request().postDataJSON();
    if (body.kind === "participants") {
      calls.push(body.cursor);
      if (body.cursor === 20 && !failed) {
        failed = true;
        return route.fulfill({ status: 404, json: {} });
      }
    }
    await route.fallback();
  });
  await page.goto("/");
  const importer = page.locator(
    'section[aria-labelledby="event-import-title"]',
  );
  await importer
    .getByLabel("Lien de la page de l’événement ou de Special:EventDetails")
    .fill(source.url);
  await importer
    .getByRole("button", { name: "Charger les participants publics" })
    .click();
  await expect(importer.getByRole("alert")).toContainText(
    "L’import s’est arrêté",
  );
  await expect(
    importer.getByRole("button", { name: "Utiliser cette liste" }),
  ).toHaveCount(0);
  await importer.getByRole("button", { name: "Reprendre l’import" }).click();
  await expect(
    importer.getByRole("button", { name: "Utiliser cette liste" }),
  ).toBeEnabled();
  expect(calls).toEqual([null, 20, 20, 26]);
});

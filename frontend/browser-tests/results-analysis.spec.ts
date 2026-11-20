import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import {
  emptySession,
  defaultQuestion,
  type Session,
  type Edit,
} from "../src/types";
import { signature } from "../src/analysis/cohorts";

function fixture(size = 582): Session {
  const s = emptySession();
  s.params = {
    ...s.params,
    title: "Analyse des contributions",
    start: "2026-11-06",
    end: "2026-11-06",
    reference: "2026-11-20",
    scope: "custom",
    projects: ["frwiki", "commonswiki", "wikidatawiki"],
    observation: { mode: "period", start: "2026-11-13", end: "2026-11-20" },
  };
  s.new_accounts = {
    start: "2026-11-06",
    end: "2026-11-06",
    unavailable: 0,
    excluded: 0,
  };
  s.catalog = [
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
    {
      id: "wikidatawiki",
      domain: "www.wikidata.org",
      family: "wikidata",
      label: "Wikidata",
    },
    {
      id: "enwiki",
      domain: "en.wikipedia.org",
      family: "wikipedia",
      label: "EN",
    },
  ];
  s.question = {
    ...defaultQuestion(),
    days: "today",
    projects: [...s.params.projects],
    wikipedia_languages: ["*"],
  };
  s.cohort = Array.from({ length: size }, (_, i) => ({
    username: `Account${String(i + 1).padStart(3, "0")}`,
    registration: "2026-11-06T10:00:00Z",
    signup: {
      timestamp: "2026-11-06T10:00:00Z",
      local_id: i + 1,
      original_name: `Account${String(i + 1).padStart(3, "0")}`,
    },
    groups: [],
    locked: false,
    exists: true,
    bot: false,
    included: true,
    exclusion_reason: "",
    roles: [],
    staff: false,
    role_conflict: false,
    technical: "completed_primary",
    warnings: [],
    providers: ["mediawiki"],
    qualified: true,
    pre_complete: true,
    post_complete: true,
    deleted_complete: true,
    deleted_classified: true,
  }));
  let revision = 0;
  for (const [i, count] of [7, 3, 2, 2, 1, 1, 1, 2, 1, 3, 1].entries())
    for (let j = 0; j < count; j++) {
      if (!s.cohort[i]) continue;
      const project = i < 7 ? "frwiki" : i < 9 ? "commonswiki" : "wikidatawiki";
      const day = i < 7 ? 13 + (revision % 7) : i < 9 ? 14 : 20;
      s.edits.push({
        username: s.cohort[i].username,
        project,
        revision: ++revision,
        page_id: revision,
        title: `Page ${revision}`,
        new_page: false,
        timestamp: `2026-11-${day}T12:00:00Z`,
        namespace: project === "commonswiki" ? 6 : 0,
        category:
          project === "commonswiki"
            ? "MEDIA"
            : project === "wikidatawiki"
              ? "STRUCTURED_DATA"
              : "CONTENT",
        automation: "normal",
        tags: [],
        provider: "mediawiki",
      });
    }
  s.collection_signature = signature(s.params);
  s.deleted_collection_version = 1;
  return s;
}
async function restore(page: Page, s: Session) {
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: s.catalog }),
  );
  await page.goto("/");
  await page.locator('input[accept=".json"]').setInputFiles({
    name: "analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await expect(
    page.getByRole("heading", { name: "Bilan de l’observation" }),
  ).toBeVisible();
}

test("desktop results explain 24 contributions, hide zero unknowns and show UTC calendars and key figures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const s = fixture();
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.push(r.url());
  });
  await restore(page, s);
  calls.length = 0;
  await expect(page.locator(".results-settings")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator(".kpis")).not.toContainText("Données à compléter");
  await expect(page.locator(".kpis")).toContainText("N’a pas contribué");
  await expect(page.locator(".charts")).not.toContainText(
    "Données à compléter",
  );
  const analysis = page.locator(".contribution-analysis");
  await expect(
    analysis.getByText(
      "11 comptes ont réalisé 24 contributions dans cette sélection.",
    ),
  ).toBeVisible();
  await expect(analysis.locator("tbody tr").nth(0)).toContainText("17");
  await expect(analysis.locator("tbody tr").nth(0)).toContainText("70,8 %");
  await expect(analysis.locator("tbody tr").nth(1)).toContainText("16,7 %");
  await mkdir("../output/results-review", { recursive: true });
  await page.screenshot({
    path: "../output/results-review/initial-desktop.png",
    fullPage: true,
  });
  await analysis
    .getByText("Ouvrir le détail des contributions", { exact: true })
    .click();
  await expect(analysis.locator("details tbody tr")).toHaveCount(24);
  await expect(
    analysis.locator("details tbody tr").first().getByRole("link"),
  ).toHaveAttribute("href", /diff=/);
  const calendar = page.locator(
    'section[aria-label="Calendrier des contributions"] .contribution-calendar',
  );
  await expect(calendar.locator(".calendar-day")).toHaveCount(0);
  await calendar.locator(":scope > summary").click();
  await expect(calendar.locator(".calendar-day")).toHaveCount(8);
  await expect(calendar.locator(".calendar-incomplete")).toHaveCount(0);
  await calendar
    .getByRole("button", {
      name: "vendredi 20 novembre 2026 : 4 contributions",
      exact: true,
    })
    .click();
  await expect(calendar.locator(".calendar-day-detail")).toContainText(
    "Contributions : 4 ; comptes distincts : 2",
  );
  await expect(calendar.locator(".calendar-day-detail tbody tr")).toHaveCount(
    4,
  );
  await expect(calendar.locator(".weekday-bars li").nth(4)).toContainText(
    "7 (29,2 %)",
  );
  await page.locator(".contributors-summary").click();
  await page.getByRole("button", { name: "Account001", exact: true }).click();
  await expect(page.locator(".individual")).toContainText(
    "Account001 a réalisé 7 contributions",
  );
  await page.locator(".individual .contribution-calendar > summary").click();
  await expect(page.locator(".individual .calendar-day")).toHaveCount(8);
  await page.locator(".key-figures > summary").click();
  await expect(page.locator(".key-figures")).toContainText(
    "Comptes avec exactement une contribution : 5",
  );
  await expect(page.locator(".topics-disclosure")).not.toHaveAttribute(
    "open",
    "",
  );
  expect(calls).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("../output/results-review", { recursive: true });
  await calendar.screenshot({
    path: "../output/results-review/calendar-desktop.png",
  });
  await analysis.screenshot({
    path: "../output/results-review/distribution-desktop.png",
  });
  await page.screenshot({
    path: "../output/results-review/results-desktop.png",
    fullPage: true,
  });
});

test("narrowing an imported analysis recalculates without API calls, archive warnings or lost coverage", async ({
  page,
}) => {
  const s = fixture();
  await restore(page, s);
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests++;
  });
  await page.locator(".results-settings > summary").click();
  await page
    .getByLabel("Contributions jusqu’au", { exact: true })
    .fill("2026-11-17");
  await expect(page.locator(".collection-action")).toHaveCount(0);
  await expect(
    page.getByText(
      /Cette analyse ne contient pas encore la collecte complémentaire/,
    ),
  ).toHaveCount(0);
  await expect(page.locator(".registration-report")).toContainText(
    "2026-11-17",
  );
  await page.getByRole("checkbox", { name: "Commons", exact: true }).uncheck();
  await expect(page.locator(".collection-action")).toHaveCount(0);
  expect(requests).toBe(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter l’analyse JSON", exact: true })
    .first()
    .click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.params.observation.end).toBe("2026-11-17");
  expect(saved.results.complete).toBe(true);
  expect(saved.results.collectedUntil).toBe("2026-11-20");
  await restore(page, saved);
  await expect(page.locator(".collection-action")).toHaveCount(0);
});

test("year calendars handle leap years and switching years without rendering every account calendar", async ({
  page,
}) => {
  const s = fixture(2);
  s.params.start =
    s.params.end =
    s.new_accounts!.start =
    s.new_accounts!.end =
      "2023-11-06";
  s.params.observation = {
    mode: "period",
    start: "2024-01-01",
    end: "2025-12-31",
  };
  s.params.reference = "2025-12-31";
  s.cohort.forEach((a) => {
    a.registration = a.signup!.timestamp = "2023-11-06T10:00:00Z";
  });
  s.edits = [
    { ...s.edits[0], timestamp: "2024-02-29T23:00:00Z" },
    { ...s.edits[1], timestamp: "2025-12-31T15:00:00Z" },
  ];
  s.collection_signature = signature(s.params);
  await restore(page, s);
  const calendar = page.locator(
    'section[aria-label="Calendrier des contributions"] .contribution-calendar',
  );
  await calendar.locator(":scope > summary").click();
  await expect(calendar.locator(".calendar-month")).toHaveCount(12);
  await expect(calendar.locator(".calendar-day")).toHaveCount(365);
  await calendar.getByLabel("Année affichée").selectOption("2024");
  await expect(calendar.locator(".calendar-day")).toHaveCount(366);
  await calendar
    .getByRole("button", {
      name: "jeudi 29 février 2024 : 1 contribution",
      exact: true,
    })
    .click();
  await expect(calendar.locator(".calendar-day-detail")).toContainText(
    "Contributions : 1 ; comptes distincts : 1",
  );
  await expect(calendar.locator(".weekday-bars li").nth(3)).toContainText(
    "1 (50 %)",
  );
  await expect(page.locator(".individual")).toHaveCount(0);
  await mkdir("../output/results-review", { recursive: true });
  await calendar.screenshot({
    path: "../output/results-review/calendar-year-desktop.png",
  });
});

test("missing project collection preserves the selected historical end date", async ({
  page,
}) => {
  const s = fixture(2);
  await restore(page, s);
  const ends: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      b = route.request().postDataJSON() ?? {};
    if (path === "/api/projects") return route.fulfill({ json: s.catalog });
    if (path === "/api/taxonomy")
      return route.fulfill({
        json: {
          version: "1",
          community_suffix: "talk",
          maintenance: [],
          families: { wikipedia: { "": "CONTENT" } },
          projects: {},
          default: "OTHER",
        },
      });
    if (path === "/api/local-accounts")
      return route.fulfill({
        json: { merged: [{ wiki: "enwiki", editcount: 1 }] },
      });
    if (path.startsWith("/api/namespaces/"))
      return route.fulfill({
        json: { namespaces: { "0": { id: 0, canonical: "" } } },
      });
    if (
      path === "/api/contributions" ||
      path === "/api/deleted-contributions"
    ) {
      ends.push(b.end);
      return route.fulfill({ json: { contributions: [], cursor: null } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.locator(".results-settings > summary").click();
  await page
    .getByLabel("Contributions jusqu’au", { exact: true })
    .fill("2026-11-17");
  await page
    .getByRole("checkbox", { name: "Wikipédia anglophone", exact: true })
    .check();
  const action = page.locator(".collection-action");
  await expect(action).toContainText("2026-11-17");
  await action
    .getByRole("button", {
      name: "Collecter les données manquantes pour cette sélection",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bilan de l’observation" }),
  ).toBeVisible();
  expect(ends.length).toBeGreaterThan(0);
  expect(ends.every((end) => end === "2026-11-17")).toBe(true);
});

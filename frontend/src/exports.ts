import { creationWindow } from "./analysis/cohorts";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import i18n from "./i18n";
import { analyzeFollowup } from "./analysis/followup";
import { resultNotices } from "./analysis/resultNotices";
import { registrationSummary } from "./analysis/registrationSummary";
import type { Session } from "./types";
import type { RegistrationImport } from "./registrationImporter";
import { cohortFilename, cohortRows } from "./cohortFiles";
export function exportCohort(
  data: RegistrationImport | Session,
  format: "csv" | "txt" = "csv",
) {
  const rows = cohortRows(data);
  if (!rows.length) return;
  download(
    new Blob(
      [
        format === "csv"
          ? csvText(rows)
          : rows.map((row) => row.username).join("\n"),
      ],
      {
        type:
          format === "csv"
            ? "text/csv;charset=utf-8"
            : "text/plain;charset=utf-8",
      },
    ),
    cohortFilename(rows[0].cohort_start, rows[0].cohort_end, format),
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[\\/:*?"<>|]/g, "_");
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(v: unknown): string {
  const text = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  return /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
}
export function csvText(rows: Record<string, unknown>[]) {
  return (
    "\uFEFF" +
    Papa.unparse(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, csvCell(v)]),
        ),
      ),
      { delimiter: ";", newline: "\r\n" },
    )
  );
}
export function exportCSV(s: Session, summary = false) {
  const r = analyzeFollowup(s);
  const common = {
    title: s.params.title,
    event_start: s.params.start,
    event_end: s.params.end,
    analysis_start: r.start,
    analysis_end: r.end,
    data_until: s.params.reference,
    question: r.question,
    ...(s.new_accounts
      ? {
          registration_cohort: s.new_accounts,
          observation: s.params.observation,
          report: registrationSummary(s),
        }
      : {}),
  };
  const rows = summary
    ? [
        {
          ...common,
          imported: s.cohort.length,
          retained: r.n,
          contributing: r.active,
          no_contribution: r.inactive,
          insufficient_data: r.unknown,
          observed_edits: r.totalEdits,
          complete: r.complete,
          definitive_percentage: r.rate,
          project_families: r.byFamily,
          filters: s.params,
          methodology: s.methodology_version,
        },
      ]
    : r.rows.map((row) => ({
        ...common,
        username: row.account.username,
        registration: row.account.registration,
        included: row.included,
        exclusion_reason: row.account.exclusion_reason,
        outcome: row.outcome,
        complete: row.complete,
        observed_edits: row.edits.length,
        last_observed_edit: row.last,
        projects: row.projects,
        providers: row.account.providers,
        technical_status: row.account.technical,
      }));
  download(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
    summary ? "synthese.csv" : "participants.csv",
  );
}
export function exportJSON(s: Session) {
  download(
    new Blob(
      [
        JSON.stringify(
          {
            ...s,
            question: analyzeFollowup(s).question,
            results: analyzeFollowup(s),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "analyse-retention.json",
  );
}
export function makePDF(s: Session, nominative = false) {
  const doc = new jsPDF(),
    r = analyzeFollowup(s);
  const t = (key: string, values: Record<string, string | number> = {}) =>
    String(i18n.t(key, values));
  let y = 28;
  const heading = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(18, 98, 88);
    const lines = doc.splitTextToSize(text, 174) as string[];
    doc.text(lines, 18, y);
    y += lines.length * 8 + 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 35, 40);
  };
  const paragraph = (text: string) => {
    const lines = doc.splitTextToSize(text, 174) as string[];
    for (const line of lines) {
      if (y > 269) {
        doc.addPage();
        y = 25;
      }
      doc.text(line, 18, y);
      y += 5.5;
    }
    y += 5;
  };
  const table = (headers: string[], rows: (string | number)[][]) => {
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: y,
      margin: { left: 18, right: 18, bottom: 22 },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [18, 98, 88] },
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 12;
  };
  const page = (title: string) => {
    doc.addPage();
    y = 25;
    heading(title);
  };
  const family = (value: string) =>
    t("fup.families." + value, { defaultValue: value });
  heading(t("app"));
  paragraph(s.params.title || t("title"));
  paragraph(
    s.new_accounts
      ? t("newAccounts.cohortDates", s.new_accounts)
      : t("pdfDates", {
          start: s.params.start,
          end: s.params.end,
          reference: s.params.reference,
        }),
  );
  paragraph(
    t("pdfGenerated", {
      date: new Date().toISOString().slice(0, 10),
      version: s.application_version,
    }),
  );
  heading(t(s.new_accounts ? "newAccounts.resultTitle" : "fup.title"));
  paragraph(s.new_accounts ? registrationSummary(s) : t("fup.help"));
  paragraph(
    r.valid
      ? t("fup.interval", { start: r.start!, end: r.end! })
      : t("fup.invalid"),
  );
  for (const notice of resultNotices(s, r)) {
    paragraph(t(notice.key, notice.values));
    if (nominative && notice.accounts.length)
      paragraph(notice.accounts.join(", "));
  }
  table(
    [
      t("retained"),
      t("fup.contributing"),
      t("fup.not_contributing"),
      t("fup.unknown"),
    ],
    [[r.n, r.active, r.inactive, r.unknown]],
  );
  paragraph(
    r.complete
      ? t("fup.answer", {
          active: r.active,
          total: r.n,
          rate: r.rate!.toLocaleString(i18n.resolvedLanguage, {
            maximumFractionDigits: 1,
          }),
        })
      : t("fup.minimum", { active: r.active, total: r.n }),
  );
  paragraph(t("totalEdits") + ": " + r.totalEdits);
  page(t("fup.projectTitle"));
  paragraph(t("fup.familyHelp"));
  for (const entry of r.byFamily) {
    if (y > 255) {
      doc.addPage();
      y = 25;
    }
    doc.text(family(entry.family).slice(0, 35), 18, y);
    doc.setFillColor(18, 98, 88);
    doc.rect(80, y - 3, (90 * entry.active) / Math.max(r.n, 1), 4, "F");
    doc.text(String(entry.active), 185, y);
    y += 11;
  }
  y += 6;
  table(
    [
      t("fup.familyColumn"),
      t("participants"),
      t("fup.observedRate"),
      t("contributions"),
    ],
    r.byFamily.map((f) => [
      family(f.family),
      f.active,
      f.percent === null
        ? ""
        : f.percent.toLocaleString(i18n.resolvedLanguage, {
            maximumFractionDigits: 1,
          }) + " %",
      f.edits,
    ]),
  );
  paragraph(
    t("fup.filters", {
      languages: r.question.wikipedia_languages.join(", "),
      categories: r.question.wikipedia_categories
        .map((c) => t("category." + c))
        .join(", "),
    }),
  );
  paragraph(t("fup.otherCategories"));
  paragraph(
    t("pdfSettings", {
      selection: t("selections." + s.params.selection),
      automation: t(s.params.exclude_automation ? "yes" : "no"),
    }),
  );
  if (s.params.selection === "new")
    paragraph(t("creationDates", creationWindow(s.params)));
  page(t("methodology"));
  for (const text of i18n.t("methodText", { returnObjects: true }) as string[])
    paragraph(text);
  paragraph(t("fup.renameHelp"));
  if (nominative) {
    page(t("detail"));
    table(
      [t("username"), t("fup.outcome"), t("contributions"), t("last")],
      r.rows.map((row) => [
        row.account.username,
        t("fup." + (!row.included ? "excluded" : row.outcome)),
        row.edits.length,
        row.last?.slice(0, 10) ?? "",
      ]),
    );
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`${t("app")} | ${t("methodVersion")} | ${i}/${pages}`, 18, 289);
  }
  return doc;
}
export function exportPDF(s: Session, nominative = false) {
  makePDF(s, nominative).save("rapport-retention.pdf");
}

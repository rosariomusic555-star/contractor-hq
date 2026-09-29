import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COST_BUCKETS, COST_TYPE_LABEL, COST_TYPE_SHORT_LABEL } from "./costPlanMath";
import { COST_SOURCE_LABEL, type CostRow, type JobCostReport } from "./jobCosts";

/**
 * "Export job costs" — CSV and an INTERNAL PDF (never client-facing: costs,
 * rates, variance). Both built from the one JobCostReport, so they match
 * the screen.
 */

const usd = (v: number) =>
  (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(",");

export function jobCostsFilename(projectName: string, ext: "csv" | "pdf", now = new Date()) {
  const safe = projectName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "Project";
  return `${safe}-Job-Costs-${now.toISOString().slice(0, 10)}.${ext}`;
}

/** Flattened rows for export: a split expense becomes its lines. */
export function flatCostRows(rows: CostRow[]): CostRow[] {
  return rows.flatMap((r) => (r.lines?.length ? r.lines.map((l) => ({ ...l, description: `${r.description} — ${l.description}` })) : [r]));
}

export function jobCostsCsv(input: {
  projectName: string;
  report: JobCostReport;
  featureName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
}): string {
  const { report: r } = input;
  const out: string[] = [];
  out.push(csvLine(["INTERNAL — job costs", input.projectName, new Date().toISOString().slice(0, 10)]));
  out.push("");
  out.push(csvLine(["Summary"]));
  out.push(csvLine(["Actual to date", r.actual]));
  out.push(csvLine(["Planned", r.planned]));
  out.push(csvLine(["Remaining", r.remaining]));
  out.push(csvLine(["Variance (overruns)", r.variance]));
  out.push(csvLine(["Expected profit", r.profit.expected]));
  out.push(csvLine(["Projected profit", r.profit.projected]));
  if (r.profit.projectedFullyLoaded != null) out.push(csvLine(["Projected fully loaded profit", r.profit.projectedFullyLoaded]));
  out.push("");
  out.push(csvLine(["Feature", ...COST_BUCKETS.flatMap((b) => [`${COST_TYPE_LABEL[b]} planned`, `${COST_TYPE_LABEL[b]} actual`]), "Total planned", "Total actual"]));
  for (const m of r.matrix) out.push(csvLine([m.name, ...COST_BUCKETS.flatMap((b) => [m.cells[b].planned, m.cells[b].actual]), m.total.planned, m.total.actual]));
  out.push("");
  out.push(csvLine(["Labor", "Approved hours", "Regular", "Overtime", "Approved cost", "Pending hours", "Pending cost"]));
  for (const p of r.labor.people) out.push(csvLine([p.name, p.approvedHours, p.regHours, p.otHours, p.approvedCost, p.pendingHours, p.pendingCost]));
  out.push(csvLine(["Planned", r.labor.plannedHours, "", "", r.labor.plannedCost]));
  out.push("");
  out.push(csvLine(["Material line", "Feature", "Unit", "Planned qty", "Planned cost", "Delivered qty", "Used qty", "Delivered cost", "Variance"]));
  for (const l of r.materials.lines)
    out.push(csvLine([l.name, input.featureName(l.featureId), l.unit, l.plannedQty, l.plannedCost, l.deliveredQty, l.usedQty, l.deliveredCost, l.variance]));
  out.push("");
  out.push(csvLine(["Date", "Source", "Description", "Vendor", "Feature", "Cost type", "Category", "Amount", "In totals", "Receipt"]));
  for (const row of flatCostRows(r.rows))
    out.push(
      csvLine([
        row.date,
        COST_SOURCE_LABEL[row.source],
        row.description,
        row.vendor,
        row.source === "expense" ? input.featureName(row.featureId) : "",
        row.costType ? COST_TYPE_LABEL[row.costType] : "",
        row.source === "expense" ? input.categoryName(row.categoryId) : "",
        row.amount,
        row.inTotals ? "yes" : "no (tracked)",
        row.receiptPath ? "yes" : "",
      ]),
    );
  return out.join("\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type PdfInput = {
  projectName: string;
  clientName: string | null;
  businessName: string | null;
  report: JobCostReport;
  featureName: (id: string | null) => string;
  categoryName: (id: string | null) => string;
};

export function downloadJobCostsPdf(input: PdfInput) {
  buildJobCostsPdf(input).save(jobCostsFilename(input.projectName, "pdf"));
}

export function buildJobCostsPdf(input: PdfInput): jsPDF {
  const { report: r } = input;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const lastY = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const head = { fillColor: [29, 36, 46] as [number, number, number], textColor: 255, fontStyle: "bold" as const, fontSize: 8 };
  const body = { fontSize: 8, textColor: [29, 36, 46] as [number, number, number] };

  // Banner — this is never a client document.
  doc.setFillColor(200, 60, 60);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("INTERNAL — JOB COSTS. NOT FOR CLIENTS.", M, 15);

  doc.setTextColor(29, 36, 46);
  doc.setFontSize(16);
  doc.text(input.projectName, M, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(104, 123, 133);
  doc.text([input.businessName, input.clientName, `As of ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`].filter(Boolean).join(" · "), M, 66);

  autoTable(doc, {
    startY: 80,
    margin: { left: M, right: M },
    head: [["Actual to date", "Planned", "Remaining", "Variance (overruns)", "Projected profit", "Fully loaded"]],
    body: [[usd(r.actual), usd(r.planned), usd(r.remaining), usd(r.variance), usd(r.profit.projected), r.profit.projectedFullyLoaded != null ? usd(r.profit.projectedFullyLoaded) : "—"]],
    headStyles: head,
    bodyStyles: { ...body, fontStyle: "bold", fontSize: 9 },
  });

  autoTable(doc, {
    startY: lastY() + 16,
    margin: { left: M, right: M },
    head: [["Feature", ...COST_BUCKETS.map((b) => COST_TYPE_SHORT_LABEL[b]), "Total"]],
    body: r.matrix.map((m) => [m.name, ...COST_BUCKETS.map((b) => `${usd(m.cells[b].actual)}\nof ${usd(m.cells[b].planned)}`), `${usd(m.total.actual)}\nof ${usd(m.total.planned)}`]),
    headStyles: head,
    bodyStyles: body,
  });

  autoTable(doc, {
    startY: lastY() + 16,
    margin: { left: M, right: M },
    head: [["Labor", "Approved h", "Reg", "OT", "Approved cost", "Pending h", "Pending cost"]],
    body: [
      ...r.labor.people.map((p) => [p.name, p.approvedHours, p.regHours, p.otHours, usd(p.approvedCost), p.pendingHours, usd(p.pendingCost)]),
      ["Planned", r.labor.plannedHours, "", "", usd(r.labor.plannedCost), "", ""],
    ],
    headStyles: head,
    bodyStyles: body,
  });

  if (r.materials.lines.length) {
    autoTable(doc, {
      startY: lastY() + 16,
      margin: { left: M, right: M },
      head: [["Material", "Feature", "Planned", "Delivered", "Used", "Planned $", "Delivered $", "Var."]],
      body: r.materials.lines.map((l) => [
        l.name,
        input.featureName(l.featureId),
        `${l.plannedQty} ${l.unit ?? ""}`,
        l.deliveredQty,
        l.usedQty,
        usd(l.plannedCost),
        usd(l.deliveredCost),
        l.variance == null ? "—" : usd(l.variance),
      ]),
      headStyles: head,
      bodyStyles: body,
    });
  }

  autoTable(doc, {
    startY: lastY() + 16,
    margin: { left: M, right: M },
    head: [["Date", "Source", "Description", "Vendor", "Feature", "Type", "Amount"]],
    body: flatCostRows(r.rows).map((row) => [
      row.date,
      COST_SOURCE_LABEL[row.source] + (row.inTotals ? "" : " (tracked)"),
      row.description,
      row.vendor ?? "",
      row.source === "expense" ? input.featureName(row.featureId) : "",
      row.costType ? COST_TYPE_SHORT_LABEL[row.costType] : "",
      usd(row.amount),
    ]),
    headStyles: head,
    bodyStyles: body,
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(200, 60, 60);
    doc.text("INTERNAL — contains costs and margins. Do not share with clients.", M, doc.internal.pageSize.getHeight() - 20);
  }
  return doc;
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BASIS_META, periodLabel, type BreakdownRow, type Period, type RevenueBasis, type RevenueReport } from "./revenueReport";

/**
 * "Export report" — a CSV (headline, breakdowns, jobs) and a PDF summary for
 * the bookkeeper. Internal (profit and margins). Built from the one
 * RevenueReport, so both match the screen.
 */

const usd = (v: number | null | undefined) =>
  v == null ? "—" : (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (c: (string | number | null | undefined)[]) => c.map(cell).join(",");

export function revenueFilename(period: Period, ext: "csv" | "pdf") {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `Revenue-${iso(period.start)}-to-${iso(new Date(period.end.getTime() - 86_400_000))}.${ext}`;
}

export function revenueCsv(input: { report: RevenueReport; period: Period; compare: Period | null; basis: RevenueBasis; businessName: string | null }): string {
  const { report: r, period, compare, basis } = input;
  const h = r.headline;
  const out: string[] = [];
  out.push(line(["Revenue report", input.businessName ?? "", periodLabel(period), `Basis: ${BASIS_META[basis].label}`]));
  out.push(line(["Internal — contains profit and margins"]));
  out.push("");
  out.push(line(["Metric", "This period", compare ? compare.label : "", compare ? periodLabel(compare) : ""]));
  const row = (label: string, now: number | null, before: number | null | undefined) => out.push(line([label, now, before ?? ""]));
  row("Booked", h.now.booked, h.before?.booked);
  row("Invoiced", h.now.invoiced, h.before?.invoiced);
  row("Collected", h.now.collected, h.before?.collected);
  row("Jobs won", h.jobsWon, h.jobsWonBefore);
  row("Average job", h.avgJob, h.avgJobBefore);
  row("Change order + add-on revenue", h.upsell, null);
  row("Completed jobs", h.profit.count, h.profitBefore?.count);
  row("Gross profit (completed jobs)", h.profit.profit, h.profitBefore?.profit);
  out.push(line(["Margin (dollar-weighted)", h.profit.marginPct == null ? "" : h.profit.marginPct.toFixed(1), h.profitBefore?.marginPct == null ? "" : h.profitBefore.marginPct.toFixed(1)]));
  if (h.profit.fullyLoaded != null) row("Fully loaded profit", h.profit.fullyLoaded, h.profitBefore?.fullyLoaded);
  const table = (title: string, rows: BreakdownRow[], extra: [string, (r: BreakdownRow) => string | number | null][] = []) => {
    out.push("");
    out.push(line([title, "Amount", "Count", ...extra.map((e) => e[0])]));
    for (const x of rows) out.push(line([x.label, x.amount, x.count, ...extra.map((e) => e[1](x))]));
  };
  table("By feature (booked)", r.byFeature, [["Margin % (completed)", (x) => (x.extra?.marginPct as number | null)?.toFixed(1) ?? ""]]);
  table("By lead source (booked)", r.byLeadSource, [["Ad spend", (x) => (x.extra?.spend as number) ?? ""], ["ROAS", (x) => (x.extra?.roas as number | null)?.toFixed(2) ?? ""]]);
  table(`By client (${BASIS_META[basis].label.toLowerCase()})`, r.byClient, [["Repeat", (x) => (x.extra?.repeat ? "yes" : "")], ["Maintenance", (x) => (x.extra?.maintenance ? "yes" : "")]]);
  table("By crew (completed jobs)", r.byCrew, [["Profit", (x) => (x.extra?.profit as number) ?? ""], ["Margin %", (x) => (x.extra?.marginPct as number | null)?.toFixed(1) ?? ""]]);
  table("Revenue type (booked)", r.revenueType);
  table("Payment methods (collected)", r.paymentMethods);
  out.push("");
  out.push(line(["Job", "Client", "Status", "Contract", "Invoiced", "Collected", "Cost", "Gross profit", "Fully loaded", "Margin %", "vs plan"]));
  for (const j of r.jobs)
    out.push(line([j.name, j.client, j.status, j.contract, j.invoiced, j.collected, j.cost, j.profit, j.fullyLoaded, j.marginPct == null ? "" : j.marginPct.toFixed(1), j.variance]));
  out.push("");
  out.push(line(["Unapplied credit received", r.unallocated.reduce((s, u) => s + u.amount, 0), r.unallocated.length]));
  out.push(line(["Payments voided", r.voided.reduce((s, u) => s + u.amount, 0), r.voided.length]));
  return out.join("\n");
}

export function buildRevenuePdf(input: { report: RevenueReport; period: Period; compare: Period | null; basis: RevenueBasis; businessName: string | null }): jsPDF {
  const { report: r, period, compare, basis } = input;
  const h = r.headline;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 40;
  const lastY = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const head = { fillColor: [29, 36, 46] as [number, number, number], textColor: 255, fontStyle: "bold" as const, fontSize: 8 };
  const body = { fontSize: 8, textColor: [29, 36, 46] as [number, number, number] };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(29, 36, 46);
  doc.text(`${input.businessName ? `${input.businessName} — ` : ""}Revenue report`, M, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(104, 123, 133);
  doc.text(`${periodLabel(period)} · basis: ${BASIS_META[basis].label}${compare ? ` · compared with ${periodLabel(compare)}` : ""} · internal`, M, 64);

  autoTable(doc, {
    startY: 78,
    margin: { left: M, right: M },
    head: [["", "This period", ...(compare ? [compare.label] : [])]],
    body: [
      ["Booked", usd(h.now.booked), ...(compare ? [usd(h.before?.booked)] : [])],
      ["Invoiced", usd(h.now.invoiced), ...(compare ? [usd(h.before?.invoiced)] : [])],
      ["Collected", usd(h.now.collected), ...(compare ? [usd(h.before?.collected)] : [])],
      ["Jobs won / average job", `${h.jobsWon} · ${usd(h.avgJob)}`, ...(compare ? [`${h.jobsWonBefore ?? 0} · ${usd(h.avgJobBefore)}`] : [])],
      ["Change orders + add-ons", `${usd(h.upsell)} (${pct(h.upsellPct)} of booked)`, ...(compare ? [""] : [])],
      ["Completed jobs · gross profit", `${h.profit.count} · ${usd(h.profit.profit)} (${pct(h.profit.marginPct)})`, ...(compare ? [`${h.profitBefore?.count ?? 0} · ${usd(h.profitBefore?.profit)}`] : [])],
      ...(h.profit.fullyLoaded != null ? [["Fully loaded profit", `${usd(h.profit.fullyLoaded)} (${pct(h.profit.fullyLoadedPct)})`, ...(compare ? [usd(h.profitBefore?.fullyLoaded)] : [])]] : []),
    ],
    headStyles: head,
    bodyStyles: body,
  });
  const breakdown = (title: string, rows: BreakdownRow[]) => {
    if (!rows.length) return;
    autoTable(doc, {
      startY: lastY() + 14,
      margin: { left: M, right: M },
      head: [[title, "Amount", "Count"]],
      body: rows.slice(0, 12).map((x) => [x.label, usd(x.amount), x.count]),
      headStyles: head,
      bodyStyles: body,
    });
  };
  breakdown("Revenue type (booked)", r.revenueType);
  breakdown("By feature (booked)", r.byFeature);
  breakdown("By lead source (booked)", r.byLeadSource);
  breakdown(`By client (${BASIS_META[basis].label.toLowerCase()})`, r.byClient);
  breakdown("Payment methods (collected)", r.paymentMethods);
  autoTable(doc, {
    startY: lastY() + 14,
    margin: { left: M, right: M },
    head: [["Job", "Status", "Contract", "Invoiced", "Collected", "Profit", "Margin"]],
    body: r.jobs.map((j) => [j.name, j.status.replace("_", " "), usd(j.contract), usd(j.invoiced), usd(j.collected), usd(j.profit), pct(j.marginPct)]),
    headStyles: head,
    bodyStyles: body,
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(104, 123, 133);
    doc.text(`Internal report — generated ${new Date().toLocaleDateString("en-US")}. Page ${i} of ${pages}.`, M, doc.internal.pageSize.getHeight() - 20);
  }
  return doc;
}

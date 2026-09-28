/**
 * The actual PDF rendering for a generated Order Sheet — jsPDF, this
 * app's first PDF-generation dependency (see the module doc comment on
 * why: this app previously had no PDF export anywhere, only the browser's
 * own print-to-PDF for the public share pages, which can't produce a
 * controlled filename or work reliably as a one-tap download on mobile).
 * Deliberately separate from orderSheet.ts's pure data-prep functions so
 * those stay trivially unit-testable without touching jsPDF at all.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { orderSheetFilename, type OrderSheetGroup } from "./orderSheet";

export interface OrderSheetHeader {
  companyName: string | null;
  projectName: string;
  deliveryAddress: string | null;
  supplier: string | null;
  /** "2026-09-30" */
  dateNeeded: string | null;
  notes: string | null;
}

const formatDateNeeded = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Builds and downloads the PDF, returning the filename it saved as (for
 * the "Mark as ordered?" follow-up prompt to reference). No prices/costs
 * anywhere on the page — this is a purchasing document, not a financial
 * one. */
export function downloadOrderSheetPdf(header: OrderSheetHeader, groups: OrderSheetGroup[]): string {
  const { doc, filename } = buildOrderSheetPdf(header, groups);
  doc.save(filename);
  return filename;
}

/** The same PDF, not downloaded — for "Email to supplier": a blob URL for
 * the preview and base64 for the attachment. */
export function orderSheetPdfForEmail(header: OrderSheetHeader, groups: OrderSheetGroup[]): { filename: string; blob: Blob; base64: string } {
  const { doc, filename } = buildOrderSheetPdf(header, groups);
  const dataUri = doc.output("datauristring");
  return { filename, blob: doc.output("blob"), base64: dataUri.slice(dataUri.indexOf(",") + 1) };
}

function buildOrderSheetPdf(header: OrderSheetHeader, groups: OrderSheetGroup[]): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 48;

  if (header.companyName) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(header.companyName, marginX, y);
    y += 22;
  }

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Material Order Sheet", marginX, y);
  y += 26;

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  const headerLines: string[] = [`Project: ${header.projectName}`];
  if (header.deliveryAddress) headerLines.push(`Deliver to: ${header.deliveryAddress}`);
  if (header.supplier) headerLines.push(`Supplier: ${header.supplier}`);
  if (header.dateNeeded) headerLines.push(`Date needed: ${formatDateNeeded(header.dateNeeded)}`);
  for (const line of headerLines) {
    doc.text(line, marginX, y);
    y += 15;
  }
  if (header.notes) {
    y += 4;
    const wrapped = doc.splitTextToSize(`Notes: ${header.notes}`, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 13;
  }
  y += 10;

  for (const group of groups) {
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 48;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(group.category, marginX, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Item / Description", "Quantity", "Unit"]],
      body: group.lines.map((l) => [l.detail ? `${l.title}\n${l.detail}` : l.title, String(l.quantity), l.unit]),
      styles: { fontSize: 10, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 70, halign: "right" },
        2: { cellWidth: 70 },
      },
      theme: "grid",
    });
    // jspdf-autotable still populates this at runtime for back-compat even
    // though the v5 typed `autoTable()` export itself returns void.
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  return { doc, filename: orderSheetFilename(header.projectName, header.supplier) };
}

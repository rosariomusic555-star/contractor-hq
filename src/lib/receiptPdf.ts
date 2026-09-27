import jsPDF from "jspdf";
import type { SharedReceipt } from "./api";
import { paymentMethodLabel } from "./projectMoney";

/**
 * Payment receipt PDF (0111) — half-letter (5.5 × 8.5 in), so it reads at
 * full width on a phone without zooming. Client-facing: branding, client,
 * project, date, amount, method, reference, what it was applied to and the
 * remaining project balance. No cost / profit / margin, no internal note.
 * A void payment's receipt is stamped VOID.
 */

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const receiptDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function receiptFilename(r: SharedReceipt) {
  return `Receipt-${r.receipt.number ?? "payment"}${r.receipt.status === "void" ? "-VOID" : ""}.pdf`;
}

/** "INV-001 · $2,000.00" lines, or the project-balance line when unapplied. */
export function receiptAppliedLines(r: SharedReceipt): string[] {
  const applied = r.applied_to ?? [];
  const lines = applied.map((a) => `${a.invoice_number ?? "Invoice"} · ${usd(Number(a.amount))}`);
  const rest = Math.round((Number(r.receipt.amount) - applied.reduce((s, a) => s + Number(a.amount), 0)) * 100) / 100;
  if (lines.length === 0) return ["Applied to project balance"];
  if (rest > 0.004) lines.push(`Project balance · ${usd(rest)}`);
  return lines;
}

export function downloadReceiptPdf(r: SharedReceipt): string {
  const doc = new jsPDF({ unit: "pt", format: [396, 612] });
  const W = doc.internal.pageSize.getWidth();
  const X = 28;
  const R = W - X;
  let y = 40;
  const isVoid = r.receipt.status === "void";

  const biz = r.business;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(29, 36, 46);
  doc.text(biz?.company_name || "Payment receipt", X, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(104, 123, 133);
  for (const line of [biz?.address, [biz?.phone, biz?.email].filter(Boolean).join(" · "), biz?.license ? `License ${biz.license}` : null]) {
    if (!line) continue;
    for (const l of doc.splitTextToSize(line, R - X)) {
      doc.text(l, X, y);
      y += 11;
    }
  }

  y += 12;
  doc.setDrawColor(226, 231, 236);
  doc.line(X, y, R, y);
  y += 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(104, 123, 133);
  doc.text("RECEIPT", X, y);
  doc.text(r.receipt.number ?? "", R, y, { align: "right" });
  y += 30;

  doc.setFontSize(28);
  doc.setTextColor(29, 36, 46);
  doc.text(usd(Number(r.receipt.amount)), X, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(104, 123, 133);
  doc.text(`Received ${receiptDate(r.receipt.paid_on)}`, X, y);
  y += 26;

  const row = (label: string, value: string | string[]) => {
    const values = Array.isArray(value) ? value : [value];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(104, 123, 133);
    doc.text(label, X, y);
    doc.setTextColor(29, 36, 46);
    doc.setFont("helvetica", "bold");
    for (const v of values) {
      const wrapped = doc.splitTextToSize(v, (R - X) * 0.6);
      for (const w of wrapped) {
        doc.text(w, R, y, { align: "right" });
        y += 13;
      }
    }
    y += 6;
    doc.setDrawColor(237, 241, 244);
    doc.line(X, y - 10, R, y - 10);
    y += 4;
  };

  if (r.client?.name) row("Client", r.client.name);
  if (r.project?.name) row("Project", r.project.name);
  if (r.project?.address) row("Address", r.project.address);
  row("Method", paymentMethodLabel(r.receipt.method));
  if (r.receipt.reference) row(r.receipt.method === "check" ? "Check #" : "Reference", r.receipt.reference);
  row("Applied to", receiptAppliedLines(r));
  if (!isVoid && r.remaining_balance != null) row("Remaining project balance", usd(Math.max(0, Number(r.remaining_balance))));

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(104, 123, 133);
  doc.text("Thank you for your payment.", X, y);

  if (isVoid) {
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(72);
    doc.text("VOID", W / 2, 330, { align: "center", angle: 30 });
    doc.setFontSize(10);
    doc.text("This payment was voided and is not counted.", W / 2, 590, { align: "center" });
  }

  const filename = receiptFilename(r);
  doc.save(filename);
  return filename;
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PortalProjectDetail } from "./portalApi";
import { clientSafeProjectDetail } from "./clientSafe";
import { approvedSelections, clientProjectMoney, historyDate, invoiceStatusLabel, paymentAppliedText, versionDate, versionsOf } from "./projectHistory";
import { invoiceBalance, invoicePaid, paymentMethodLabel } from "./projectMoney";

/**
 * Consolidated Project Summary PDF (0113) — branded, letter size,
 * print-friendly, same palette / type as the receipt PDF. Built from the
 * client-safe project payload only (re-sanitized here), so the client's
 * copy and the contractor's copy are identical and can never carry cost,
 * margin, overhead or internal notes. Always current data, stamped
 * "as of" the moment it's generated.
 */

const INK: [number, number, number] = [29, 36, 46];
const MUTED: [number, number, number] = [104, 123, 133];
const LINE: [number, number, number] = [226, 231, 236];
const HAIR: [number, number, number] = [237, 241, 244];

const usd = (v: number) =>
  (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v: number) => (v < 0 ? `- ${usd(-v)}` : `+ ${usd(v)}`);

export function projectSummaryFilename(detail: Pick<PortalProjectDetail, "project">, now = new Date()) {
  const safe = detail.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "Project";
  return `${safe}-Summary-${now.toISOString().slice(0, 10)}.pdf`;
}

export function buildProjectSummaryPdf(raw: PortalProjectDetail, opts: { logoDataUrl?: string | null; now?: Date } = {}): jsPDF {
  const detail = clientSafeProjectDetail(raw);
  const now = opts.now ?? new Date();
  const { breakdown, summary } = clientProjectMoney(detail);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const X = 48;
  const R = W - X;
  let y = 52;

  const ensure = (need: number) => {
    if (y + need > H - 56) {
      doc.addPage();
      y = 52;
    }
  };
  const text = (s: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "right" } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(o.size ?? 10);
    doc.setTextColor(...(o.color ?? INK));
    doc.text(s, x, yy, o.align === "right" ? { align: "right" } : undefined);
  };
  const heading = (s: string) => {
    ensure(48);
    y += 8;
    text(s.toUpperCase(), X, y, { size: 9, bold: true, color: MUTED });
    y += 8;
  };
  const lastY = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const table = (head: string[], body: string[][], align: ("left" | "right")[], strike: boolean[] = []) => {
    autoTable(doc, {
      startY: y,
      margin: { left: X, right: X },
      head: [head],
      body,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.6 } },
      headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8, lineColor: LINE, lineWidth: { bottom: 0.8 } },
      columnStyles: Object.fromEntries(align.map((a, i) => [i, { halign: a }])),
      didParseCell: (d) => {
        if (d.section === "body" && strike[d.row.index]) d.cell.styles.textColor = MUTED;
      },
    });
    y = lastY() + 18;
  };

  // --- Header: branding (left), document title (right)
  const biz = detail.business;
  let bx = X;
  if (opts.logoDataUrl) {
    try {
      const props = doc.getImageProperties(opts.logoDataUrl);
      const ratio = props.width / props.height;
      let h = 40;
      let w = ratio * h;
      if (w > 120) {
        w = 120;
        h = w / ratio;
      }
      doc.addImage(opts.logoDataUrl, X, y - 14, w, h);
      bx = X + w + 12;
    } catch {
      // a logo that won't decode just isn't drawn
    }
  }
  text(biz.company_name || "Project summary", bx, y, { size: 14, bold: true });
  let by = y + 13;
  for (const line of [biz.address, [biz.phone, biz.email].filter(Boolean).join(" · "), biz.license ? `License ${biz.license}` : null]) {
    if (!line) continue;
    text(line, bx, by, { size: 8.5, color: MUTED });
    by += 11;
  }
  text("PROJECT SUMMARY", R, y, { size: 9, bold: true, color: MUTED, align: "right" });
  text(`As of ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, R, y + 13, { size: 8.5, color: MUTED, align: "right" });
  y = Math.max(by, y + 40) + 8;
  doc.setDrawColor(...LINE);
  doc.line(X, y, R, y);
  y += 22;

  // --- Client + project
  text(detail.project.name, X, y, { size: 16, bold: true });
  y += 16;
  const who = [detail.client?.name ? `Prepared for ${detail.client.name}` : null, detail.project.address].filter(Boolean) as string[];
  for (const l of who) {
    text(l, X, y, { size: 9.5, color: MUTED });
    y += 12;
  }
  y += 8;

  // --- Contract math
  heading("Contract");
  const contractRows = breakdown.lines.map((l, i) => [l.label, i === 0 ? usd(l.amount) : signed(l.amount)]);
  if (contractRows.length === 0) contractRows.push(["No approved contract yet", usd(0)]);
  contractRows.push(["= Current contract value", usd(breakdown.total)]);
  autoTable(doc, {
    startY: y,
    margin: { left: X, right: X },
    body: contractRows,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.6 } },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.row.index === contractRows.length - 1) d.cell.styles.fontStyle = "bold";
    },
  });
  y = lastY() + 18;

  // --- Balances
  heading("Balances");
  const balanceRows = [
    ["Current contract value", usd(summary.contractValue)],
    ["Amount invoiced", usd(summary.invoiced)],
    ["Payments received", usd(summary.received)],
    ["Unpaid invoices", usd(summary.unpaidInvoiceBalance)],
    summary.overpaid > 0.004 ? ["Credit balance", usd(summary.overpaid)] : ["Remaining project balance", usd(Math.max(0, summary.remaining))],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: X, right: X },
    body: balanceRows,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.6 } },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.row.index === balanceRows.length - 1) d.cell.styles.fontStyle = "bold";
    },
  });
  y = lastY() + 6;
  text("Remaining project balance is what's left on your total contract after all payments received.", X, y + 6, { size: 8, color: MUTED });
  y += 24;

  // --- Documents
  heading("Quotes & change orders");
  const docRows: string[][] = [];
  const docStrike: boolean[] = [];
  const statusText = (s: string) => (s === "approved" ? "Approved" : s === "declined" ? "Declined" : "Sent — pending");
  for (const q of [...detail.quotes].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
    const vs = versionsOf(detail, "quote", q.id);
    const base = q.kind === "addon" ? `Add-on quote${q.addon_number ? ` #${q.addon_number}` : ""}` : "Quote";
    if (vs.length <= 1) {
      docRows.push([base, historyDate(vs[0] ? versionDate(vs[0], q.created_at) : q.created_at), statusText(q.status), usd(Number(q.total ?? vs[0]?.total ?? 0))]);
      docStrike.push(false);
    } else {
      const latest = vs[vs.length - 1].version;
      for (const v of vs) {
        const sup = v.version < latest;
        docRows.push([`${base} v${v.version}`, historyDate(versionDate(v, q.created_at)), sup ? `Superseded by v${latest}` : statusText(q.status), usd(Number(v.total ?? 0))]);
        docStrike.push(sup);
      }
    }
  }
  for (const co of [...detail.change_orders].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    docRows.push([
      `Change order${co.number ? ` #${co.number}` : ""} · ${co.title}`,
      historyDate((() => { const v0 = versionsOf(detail, "change_order", co.id)[0]; return v0 ? versionDate(v0, co.created_at) : co.created_at; })()),
      co.status === "approved" ? "Approved" : co.status === "declined" ? "Declined — not included" : "Pending — not included",
      Number(co.total ?? co.amount) < 0 ? `- ${usd(-Number(co.total ?? co.amount))}` : usd(Number(co.total ?? co.amount)),
    ]);
    docStrike.push(co.status !== "approved");
  }
  if (docRows.length) table(["Document", "Date", "Status", "Amount"], docRows, ["left", "left", "left", "right"], docStrike);
  else {
    text("No quotes or change orders yet.", X, y + 6, { size: 9, color: MUTED });
    y += 22;
  }

  const selections = approvedSelections(detail);
  if (selections.length) {
    heading("Your selections");
    table(
      ["Area", "Selection", "Choice", "Price"],
      selections.map((x) => [x.section, x.group, x.choices.join(", ") + (x.history ? `\n${x.history.replace(/→/g, "->")}` : ""), x.price ? (x.price < 0 ? `- ${usd(-x.price)}` : `+ ${usd(x.price)}`) : "Included"]),
      ["left", "left", "left", "right"],
    );
  }

  heading("Invoices");
  if (detail.invoices.length) {
    table(
      ["Invoice", "Date", "Status", "Amount", "Paid", "Balance"],
      [...detail.invoices]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => {
          const inv = { ...i, status: i.status as "sent" };
          return [i.invoice_number ?? "Invoice", historyDate(i.created_at), invoiceStatusLabel(i).label, usd(Number(i.amount)), usd(invoicePaid(inv)), usd(invoiceBalance(inv))];
        }),
      ["left", "left", "left", "right", "right", "right"],
    );
  } else {
    text("No invoices yet.", X, y + 6, { size: 9, color: MUTED });
    y += 22;
  }

  heading("Payments");
  const pays = [...(detail.payments ?? [])].sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));
  if (pays.length) {
    table(
      ["Date", "Method", "Reference", "Applied to", "Receipt", "Amount"],
      pays.map((p) => [
        historyDate(p.paid_on),
        paymentMethodLabel(p.method),
        p.reference ?? "—",
        p.status === "void" ? "VOID — not counted" : paymentAppliedText(p),
        p.receipt_number ?? "—",
        usd(Number(p.amount)),
      ]),
      ["left", "left", "left", "left", "left", "right"],
      pays.map((p) => p.status === "void"),
    );
  } else {
    text("No payments yet.", X, y + 6, { size: 9, color: MUTED });
    y += 22;
  }

  // --- Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    text(`${biz.company_name ?? ""}${biz.company_name ? " · " : ""}${detail.project.name} · Project summary as of ${historyDate(now.toISOString())}`, X, H - 28, { size: 7.5, color: MUTED });
    text(`Page ${i} of ${pages}`, R, H - 28, { size: 7.5, color: MUTED, align: "right" });
  }
  return doc;
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Loads an image URL as a PNG data URL (for the PDF logo). Null on failure. */
export async function imageUrlToDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("logo"));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Downloads the summary. Android / desktop: a normal file download. iOS
 * Safari ignores download attributes on blobs, so the PDF opens in a new
 * tab instead (Share → Save to Files) — that tab is opened synchronously
 * on the tap, before any await, so it isn't popup-blocked.
 */
export async function downloadProjectSummary(detail: PortalProjectDetail, getLogoUrl?: () => Promise<string | null>): Promise<void> {
  const ios = isIOS();
  const tab = ios ? window.open("", "_blank") : null;
  try {
    const logo = getLogoUrl ? await imageUrlToDataUrl(await getLogoUrl()) : null;
    const doc = buildProjectSummaryPdf(detail, { logoDataUrl: logo });
    const name = projectSummaryFilename(detail);
    if (ios) {
      const url = URL.createObjectURL(doc.output("blob"));
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } else {
      doc.save(name);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

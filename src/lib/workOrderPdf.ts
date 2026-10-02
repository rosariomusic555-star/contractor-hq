import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { crewSafeWorkOrder, type CrewAttachment, type CrewWorkOrder } from "./crewSafe";
import { categoryLabel, isPdf } from "./workOrderAttachments";
import { CREW_MATERIAL_STATUS_LABEL, crewLocate, crewMaterialStatus, fmtQty } from "./workOrder";
import { isoDate } from "./weatherRisk";

/**
 * Crew work order PDF (0125) — letter size, print-friendly, same palette as
 * the project summary. Built from the crew-safe payload only (re-sanitized
 * here), so it can never carry prices, costs or internal notes. Measurement
 * diagrams come in as PNGs rasterized from the page (see rasterizeDiagrams).
 * Stamped with the moment it's generated. jsPDF's built-in font: plain ASCII
 * only (no "−" or "→").
 */

const INK: [number, number, number] = [29, 36, 46];
const MUTED: [number, number, number] = [104, 123, 133];
const HAIR: [number, number, number] = [237, 241, 244];
const WARN: [number, number, number] = [180, 83, 9];

const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "-";
const ascii = (s: string | null | undefined) => (s ?? "").replace(/[−–—]/g, "-").replace(/→/g, "->").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, "");

export function workOrderFilename(wo: Pick<CrewWorkOrder, "project">, now = new Date()) {
  const safe = wo.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "Job";
  return `${safe}-Work-Order-${now.toISOString().slice(0, 10)}.pdf`;
}

export interface PdfPinnedImage {
  title: string;
  note: string | null;
  dataUrl: string;
  w: number;
  h: number;
}

export interface WorkOrderPdfAttachments {
  /** Pinned attachments as images (a PDF's first page), each on its own page. */
  pinnedImages: PdfPinnedImage[];
  /** Every attachment, listed by title. */
  attachments: CrewAttachment[];
  featureLabel: (id: string | null) => string | null;
}

export function buildWorkOrderPdf(
  raw: CrewWorkOrder,
  diagrams: Map<string, { dataUrl: string; w: number; h: number }>,
  now = new Date(),
  files?: WorkOrderPdfAttachments,
): jsPDF {
  const wo = crewSafeWorkOrder(raw)!;
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
  const text = (s: string, x: number, o: { size?: number; bold?: boolean; color?: [number, number, number]; width?: number } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(o.size ?? 10);
    doc.setTextColor(...(o.color ?? INK));
    const lines = doc.splitTextToSize(ascii(s), o.width ?? R - x) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, x, y);
      y += (o.size ?? 10) * 1.35;
    }
  };
  const heading = (s: string) => {
    ensure(40);
    y += 10;
    doc.setDrawColor(...HAIR);
    doc.line(X, y - 12, R, y - 12);
    text(s.toUpperCase(), X, { size: 9, bold: true, color: MUTED });
    y += 2;
  };
  const lastY = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Header
  text("CREW WORK ORDER", X, { size: 9, bold: true, color: MUTED });
  text(wo.project.name, X, { size: 18, bold: true });
  if (wo.project.address) text(wo.project.address, X, { size: 11 });
  text(
    [
      `Scheduled ${day(wo.project.scheduled_start_date)}${wo.project.scheduled_end_date ? ` to ${day(wo.project.scheduled_end_date)}` : ""}`,
      wo.project.crew_name ? `Crew: ${wo.project.crew_name}` : null,
    ]
      .filter(Boolean)
      .join("   |   "),
    X,
    { size: 10, color: MUTED },
  );
  text(`Generated ${now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`, X, { size: 8, color: MUTED });
  for (const d of wo.delays) text(`Rain/schedule delay: ${day(d.date)} (+${d.days} working day${d.days === 1 ? "" : "s"})`, X, { size: 9, color: WARN });

  // Site
  heading("Site");
  if (wo.site.conditions) text(wo.site.conditions, X);
  const chips = [["Slope", wo.site.slope], ["Access", wo.site.access], ["Soil", wo.site.soil], ["Demo", wo.site.demo]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (chips.length) text(chips.join("   "), X, { color: MUTED });
  const l = crewLocate(wo, isoDate(now));
  if (l) {
    text(l.ticket ? `811 TICKET #${l.ticket}   Clear to dig ${day(l.clearToDig)}   Expires ${day(l.expires)}` : "811: no ticket on file", X, { bold: true, size: 11 });
    if (l.warning) text(l.warning, X, { bold: true, color: WARN });
  }
  for (const p of wo.permits.filter((x) => x.kind !== "locate")) {
    text(`${p.label}: ${p.permit_status ?? p.status}${p.number ? ` #${p.number}` : ""}${p.date ? ` (${day(p.date)})` : ""}`, X);
  }

  // Client
  heading("Client");
  text(`${wo.client.name ?? "-"}${wo.client.phone ? `   ${wo.client.phone}` : ""}`, X, { bold: true });
  if (wo.client.notes_for_crew) text(`Note: ${wo.client.notes_for_crew}`, X);
  if (wo.crew_notes.text) {
    heading("Crew notes / special instructions");
    text(wo.crew_notes.text, X);
  }

  // Scope
  for (const f of wo.features) {
    heading(f.label);
    for (const m of f.measurements) {
      const img = diagrams.get(m.id);
      if (img) {
        const w = Math.min(260, img.w);
        const h = (img.h / img.w) * w;
        ensure(h + 8);
        doc.addImage(img.dataUrl, "PNG", X, y - 4, w, h);
        y += h + 6;
      }
    }
    if (f.selections.length) text(f.selections.map((s) => `${s.group}: ${s.choices.join(", ")}`).join("   |   "), X, { bold: true });
    for (const s of f.scope) text(`- ${s.name}${s.quantity ? ` (${fmtQty(Number(s.quantity))} ${s.unit ?? ""})` : ""}${s.description ? `: ${s.description}` : ""}`, X + 6);
    if (f.labor?.crew_days) text(`Planned: ${fmtQty(Number(f.labor.crew_days))} crew-days${f.labor.crew_size ? ` (crew of ${fmtQty(Number(f.labor.crew_size))})` : ""}`, X, { color: MUTED });
    else if (f.labor?.man_hours) text(`Planned: ${fmtQty(Number(f.labor.man_hours))} man-hours`, X, { color: MUTED });
    for (const c of f.changes) {
      text(`CHANGED - Change order #${c.number ?? ""} ${c.title}${c.scope_note ? `: ${c.scope_note}` : ""}`, X, { bold: true, color: WARN });
      for (const i of c.items) text(`- ${i.name}${i.quantity ? ` (${fmtQty(Number(i.quantity))} ${i.unit ?? ""})` : ""}`, X + 6);
    }
  }
  if (wo.general_scope.length) {
    heading("Other scope");
    for (const s of wo.general_scope) text(`- ${s.name}${s.description ? `: ${s.description}` : ""}`, X + 6);
  }

  // Materials
  const materials = wo.materials.filter((m) => Number(m.planned_quantity ?? m.quantity) > 0);
  if (materials.length) {
    heading("Materials");
    const missingColors = materials.filter((m) => m.missing_color).length;
    if (missingColors) text(`${missingColors} item${missingColors === 1 ? "" : "s"} missing a color - check with the office.`, X);
    const featureName = new Map(wo.features.map((f) => [f.id, f.label]));
    autoTable(doc, {
      startY: y,
      margin: { left: X, right: X },
      head: [["Item", "Color / product", "Qty (incl. waste)", "Status"]],
      body: materials.map((m) => {
        const s = crewMaterialStatus(m);
        return [
          ascii(`${m.feature_id ? `${featureName.get(m.feature_id) ?? m.section}: ` : ""}${m.name}${m.description ? `\n${m.description}` : ""}`),
          ascii([m.color, m.product].filter(Boolean).join(" / ") || (m.missing_color ? "COLOR NOT SET" : "-")),
          `${fmtQty(s.planned)} ${m.unit ?? ""}`,
          CREW_MATERIAL_STATUS_LABEL[s.status],
        ];
      }),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.6 } },
      headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8 },
    });
    y = lastY() + 16;
    const upcoming = wo.deliveries.filter((d) => d.status !== "delivered" && d.expected_date);
    if (upcoming.length) text(`Deliveries: ${upcoming.map((d) => `${d.supplier ?? "Delivery"} ${day(d.expected_date)}`).join("   |   ")}`, X);
  }

  // Attachments (0154): the list, then each pinned one on its own page.
  if (files && files.attachments.length) {
    heading("Attachments");
    for (const a of files.attachments) {
      const where = files.featureLabel(a.feature_id);
      text(
        `- ${a.title}${a.pinned ? " (pinned - see the following pages)" : ""}   [${categoryLabel(a.category)}${where ? `, ${where}` : ""}${isPdf(a.mime_type) ? `, PDF${a.page_count ? ` ${a.page_count} p.` : ""}` : ""}]`,
        X + 6,
      );
      if (a.note) text(a.note, X + 16, { size: 9, color: MUTED });
    }
  }
  for (const img of files?.pinnedImages ?? []) {
    doc.addPage();
    y = 52;
    text(img.title, X, { size: 14, bold: true });
    if (img.note) text(img.note, X, { size: 9, color: MUTED });
    const maxW = R - X;
    const maxH = H - 56 - y;
    const k = Math.min(maxW / img.w, maxH / img.h);
    doc.addImage(img.dataUrl, "JPEG", X + (maxW - img.w * k) / 2, y, img.w * k, img.h * k);
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(ascii(`${wo.project.name} - work order - page ${i} of ${pages}`), X, H - 28);
  }
  return doc;
}

/** Turn on-page diagram SVGs (data-diagram-id) into PNGs, with the computed
 * Tailwind colors inlined so they survive outside the page. */
export async function rasterizeDiagrams(root: ParentNode): Promise<Map<string, { dataUrl: string; w: number; h: number }>> {
  const out = new Map<string, { dataUrl: string; w: number; h: number }>();
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-diagram-id]")];
  for (const node of nodes) {
    const svg = node.querySelector("svg");
    if (!svg) continue;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const src = [svg, ...svg.querySelectorAll("*")] as Element[];
    const dst = [clone, ...clone.querySelectorAll("*")] as Element[];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const t = dst[i] as SVGElement;
      for (const p of ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-size", "font-weight", "font-family", "opacity"]) {
        const v = cs.getPropertyValue(p);
        if (v) t.style.setProperty(p, v);
      }
    });
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox?.baseVal;
    const w = vb?.width || box.width || 240;
    const h = vb?.height || box.height || 160;
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    const img = new Image();
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      img.src = url;
    });
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx || !img.width) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    out.set(node.dataset.diagramId as string, { dataUrl: canvas.toDataURL("image/png"), w, h });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attachments in the PDF (0154)
// ---------------------------------------------------------------------------

async function toJpegDataUrl(source: CanvasImageSource, w: number, h: number, maxEdge = 2000): Promise<{ dataUrl: string; w: number; h: number }> {
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height };
}

/** Pinned attachments as page-sized JPEGs (a PDF contributes its first page). */
export async function loadPinnedImagesForPdf(pinned: CrewAttachment[], urls: Record<string, string>): Promise<PdfPinnedImage[]> {
  const out: PdfPinnedImage[] = [];
  for (const a of pinned) {
    const url = urls[a.id];
    if (!url) continue;
    try {
      if (isPdf(a.mime_type)) {
        const { loadPdfJs } = await import("./workOrderAttachmentsApi");
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({ url });
        const page = await (await task.promise).getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
        void task.destroy();
        out.push({ title: `${a.title} (page 1)`, note: a.note, ...(await toJpegDataUrl(c, c.width, c.height)) });
      } else {
        const bmp = await createImageBitmap(await (await fetch(url)).blob());
        out.push({ title: a.title, note: a.note, ...(await toJpegDataUrl(bmp, bmp.width, bmp.height)) });
        bmp.close();
      }
    } catch {
      // unreadable / offline — it's still in the attachment list
    }
  }
  return out;
}

/** Save the work order PDF, optionally with attached PDFs appended (pdf-lib,
 * loaded only when needed). A PDF that can't be merged is skipped and named. */
export async function saveWorkOrderPdf(doc: jsPDF, filename: string, append: { title: string; url: string }[]): Promise<string[]> {
  if (!append.length) {
    doc.save(filename);
    return [];
  }
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.load(doc.output("arraybuffer"));
  const skipped: string[] = [];
  for (const f of append) {
    try {
      const src = await PDFDocument.load(await (await fetch(f.url)).arrayBuffer(), { ignoreEncryption: true });
      for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
    } catch {
      skipped.push(f.title);
    }
  }
  const bytes = await merged.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return skipped;
}

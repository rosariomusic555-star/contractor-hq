import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { crewSafeWorkOrder, type CrewWorkOrder } from "./crewSafe";
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

export function buildWorkOrderPdf(raw: CrewWorkOrder, diagrams: Map<string, { dataUrl: string; w: number; h: number }>, now = new Date()): jsPDF {
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
  if (wo.materials.length) {
    heading("Materials");
    const featureName = new Map(wo.features.map((f) => [f.id, f.label]));
    autoTable(doc, {
      startY: y,
      margin: { left: X, right: X },
      head: [["Item", "Color / product", "Qty (incl. waste)", "Status"]],
      body: wo.materials.map((m) => {
        const s = crewMaterialStatus(m);
        return [
          ascii(`${m.feature_id ? `${featureName.get(m.feature_id) ?? m.section}: ` : ""}${m.name}`),
          ascii([m.color, m.product].filter(Boolean).join(" / ") || "-"),
          `${fmtQty(s.planned)} ${m.unit ?? ""}`,
          CREW_MATERIAL_STATUS_LABEL[s.status],
        ];
      }),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.6 } },
      headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8 },
    });
    y = lastY() + 16;
    const upcoming = wo.deliveries.filter((d) => d.expected_date);
    if (upcoming.length) text(`Deliveries: ${upcoming.map((d) => `${d.supplier ?? "Delivery"} ${day(d.expected_date)}`).join("   |   ")}`, X);
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

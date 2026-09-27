/* =============================================================================
 * Crew work order (0125) — pure helpers on top of the crew-safe payload:
 * material status (in the line's own unit, with waste), 811 dates, what
 * changed since the crew last opened it, map links, and the offline copy.
 * ========================================================================== */

import { convertToSheetUnit } from "@/lib/materialTracking";
import { quantityWithWaste } from "@/lib/materialsMath";
import type { MaterialsItem } from "@/lib/api";
import { locateDates, type PreconSettingsLike } from "@/lib/precon";
import type { CrewMaterial, CrewWorkOrder } from "@/lib/crewSafe";

export type CrewMaterialStatus = "not_ordered" | "ordered" | "partial" | "delivered" | "untracked";

export const CREW_MATERIAL_STATUS_LABEL: Record<CrewMaterialStatus, string> = {
  not_ordered: "Not ordered",
  ordered: "Ordered",
  partial: "Partially delivered",
  delivered: "Delivered",
  untracked: "—",
};

const EPS = 1e-6;

/** Planned quantity incl. waste, and how much is ordered / delivered, in the line's unit. */
export function crewMaterialStatus(m: CrewMaterial): { planned: number; ordered: number; delivered: number; status: CrewMaterialStatus } {
  const planned = quantityWithWaste(Number(m.planned_quantity ?? m.quantity) || 0, m.waste_percent);
  const asLine = { unit: m.unit, conversion_factor: m.conversion_factor, conversion_unit: m.conversion_unit } as Pick<MaterialsItem, "unit" | "conversion_unit" | "conversion_factor">;
  let ordered = 0;
  let delivered = 0;
  for (const o of m.orders ?? []) {
    const q = convertToSheetUnit(Number(o.quantity) || 0, o.unit, asLine) ?? 0;
    ordered += q;
    if (o.status === "delivered") delivered += q;
  }
  if (!m.tracked) return { planned, ordered, delivered, status: "untracked" };
  const status: CrewMaterialStatus =
    planned > EPS && delivered + EPS >= planned ? "delivered" : delivered > EPS ? "partial" : ordered > EPS ? "ordered" : "not_ordered";
  return { planned, ordered, delivered, status };
}

export function fmtQty(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** 811 details for the header: ticket, clear-to-dig, expiry, and a warning. */
export function crewLocate(
  wo: Pick<CrewWorkOrder, "permits" | "locate_rules" | "project">,
  today: string,
): { ticket: string; clearToDig: string | null; expires: string | null; warning: string | null } | null {
  const l = wo.permits.find((p) => p.kind === "locate");
  if (!l) return null;
  if (!l.ticket) return { ticket: "", clearToDig: null, expires: null, warning: "No 811 ticket on file — don't dig" };
  const settings: PreconSettingsLike = { warn_days: 5, locate_wait_days: wo.locate_rules.wait_days, locate_valid_days: wo.locate_rules.valid_days };
  const d = locateDates(l.submitted, settings);
  if (!d) return { ticket: l.ticket, clearToDig: null, expires: null, warning: "Submitted date missing — check before digging" };
  const warning = d.expires < today ? "Ticket EXPIRED — do not dig" : today < d.clearToDig ? "Not clear to dig yet" : null;
  return { ticket: l.ticket, clearToDig: d.clearToDig, expires: d.expires, warning };
}

/** Apple Maps on iPhone/iPad/Mac, Google Maps elsewhere. */
export function navigateUrl(address: string, ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const q = encodeURIComponent(address.trim());
  return /iPhone|iPad|iPod|Macintosh/i.test(ua) ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export function telHref(phone: string): string {
  const t = phone.trim();
  const digits = t.replace(/[^\d]/g, "");
  return `tel:${t.startsWith("+") ? "+" : ""}${digits}`;
}

// ---------------------------------------------------------------------------
// What changed since the crew last opened it
// ---------------------------------------------------------------------------

const j = (v: unknown) => JSON.stringify(v ?? null);

/** Short, plain lines: "Paver Patio: Border color → Onyx Black". */
export function workOrderChanges(prev: CrewWorkOrder | null | undefined, next: CrewWorkOrder): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (prev.project.scheduled_start_date !== next.project.scheduled_start_date || prev.project.scheduled_end_date !== next.project.scheduled_end_date) {
    out.push("Schedule dates changed");
  }
  if (prev.project.address !== next.project.address) out.push("Address changed");
  if ((prev.crew_notes?.text ?? "") !== (next.crew_notes?.text ?? "") || j(prev.crew_notes?.photos) !== j(next.crew_notes?.photos)) out.push("Crew notes updated");
  if ((prev.client?.notes_for_crew ?? "") !== (next.client?.notes_for_crew ?? "")) out.push("Client notes updated");
  const prevLocate = prev.permits.find((p) => p.kind === "locate");
  const nextLocate = next.permits.find((p) => p.kind === "locate");
  if (j(prevLocate) !== j(nextLocate)) out.push("811 ticket updated");

  const prevF = new Map(prev.features.map((f) => [f.id, f]));
  for (const f of next.features) {
    const p = prevF.get(f.id);
    if (!p) {
      out.push(`New: ${f.label}`);
      continue;
    }
    const prevSel = new Map(p.selections.map((s) => [s.group, s.choices.join(", ")]));
    for (const s of f.selections) {
      const before = prevSel.get(s.group);
      if (before !== undefined && before !== s.choices.join(", ")) out.push(`${f.label}: ${s.group} → ${s.choices.join(", ")}`);
    }
    if (j(p.measurements.map((m) => m.data)) !== j(f.measurements.map((m) => m.data))) out.push(`${f.label}: measurements changed`);
    if (f.changes.length > p.changes.length) out.push(`${f.label}: new change order${f.changes.length - p.changes.length > 1 ? "s" : ""}`);
    if (j(p.scope) !== j(f.scope) && f.changes.length === p.changes.length) out.push(`${f.label}: scope updated`);
  }
  for (const p of prev.features) if (!next.features.some((f) => f.id === p.id)) out.push(`Removed: ${p.label}`);

  const prevM = new Map(prev.materials.map((m) => [m.id, m]));
  let matChanged = 0;
  for (const m of next.materials) {
    const p = prevM.get(m.id);
    if (!p || p.planned_quantity !== m.planned_quantity || p.color !== m.color || p.name !== m.name) matChanged++;
  }
  if (matChanged) out.push(`${matChanged} material line${matChanged === 1 ? "" : "s"} changed`);
  return out;
}

// ---------------------------------------------------------------------------
// Offline copy (read-only when signal drops)
// ---------------------------------------------------------------------------

const cacheKey = (projectId: string) => `chq_work_order:${projectId}`;

export function saveOfflineWorkOrder(projectId: string, wo: CrewWorkOrder): void {
  try {
    localStorage.setItem(cacheKey(projectId), JSON.stringify({ savedAt: new Date().toISOString(), wo }));
  } catch {
    // storage full / blocked — the page still works online
  }
}

export function loadOfflineWorkOrder(projectId: string): { savedAt: string; wo: CrewWorkOrder } | null {
  try {
    const raw = localStorage.getItem(cacheKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

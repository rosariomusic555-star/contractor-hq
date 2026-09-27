/* =============================================================================
 * Pre-construction checklist (0124) — the one place readiness is worked out.
 * Pure: the project page, Bookings, Needs you, the "start anyway" warning,
 * the rain-delay preview and the daily reminder all read from here.
 *
 * Auto items check themselves from what the app already knows (signals);
 * the contractor can override any of them with a note. Manual items (HOA,
 * permit, 811, custom) are open / done / N/A, with their own details.
 * 811 dates are counted in WORKING days (scheduleShift's helpers).
 * ========================================================================== */

import { addWorkingDays, isWorkingDay } from "@/lib/scheduleShift";
import { isoDate } from "@/lib/weatherRisk";

export type PreconKind =
  | "quote"
  | "selections"
  | "deposit"
  | "materials"
  | "deliveries"
  | "crew"
  | "start_confirmed"
  | "hoa"
  | "permit"
  | "locate"
  | "custom";

export const AUTO_KINDS = new Set<PreconKind>(["quote", "selections", "deposit", "materials", "deliveries", "crew", "start_confirmed"]);

export type ItemState = "done" | "open" | "na";

export interface PreconItemRow {
  id: string;
  key: string;
  label: string;
  kind: PreconKind;
  required: boolean;
  sort_order: number;
  status: ItemState;
  override: boolean;
  note: string | null;
  details: Record<string, unknown>;
  done_at: string | null;
  removed: boolean;
}

export interface PreconSettingsLike {
  warn_days: number;
  locate_wait_days: number;
  locate_valid_days: number;
}

export const PRECON_SETTINGS_DEFAULTS: PreconSettingsLike = { warn_days: 5, locate_wait_days: 3, locate_valid_days: 15 };

/** What the app already knows about a job — gathered by usePreconSignals. */
export interface PreconSignals {
  quoteApproved: boolean;
  hasSelections: boolean;
  /** Selection groups not approved + open client change requests. */
  selectionsOpen: number;
  deposit: { due: number; paid: number };
  /** Tracked material lines, and the ones not fully ordered yet. */
  materials: { tracked: number; short: string[] };
  /** Tracked lines not fully delivered with no delivery expected by the start date. */
  deliveries: { unscheduled: string[] };
  crewName: string | null;
  startConfirmed: boolean;
}

export type PreconAction =
  | "open_quote"
  | "open_selections"
  | "record_payment"
  | "open_cost_plan"
  | "assign_crew"
  | "send_start_confirmation"
  | "edit";

export interface ItemView {
  item: PreconItemRow;
  state: ItemState;
  auto: boolean;
  /** The auto result, shown beside a manual override. */
  autoState?: ItemState;
  detail: string;
  warnings: string[];
  action?: PreconAction;
}

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The auto check for one system item. */
export function autoCheck(kind: PreconKind, s: PreconSignals): { state: ItemState; detail: string; action?: PreconAction } {
  switch (kind) {
    case "quote":
      return s.quoteApproved ? { state: "done", detail: "Signed" } : { state: "open", detail: "No signed quote yet", action: "open_quote" };
    case "selections":
      if (!s.hasSelections) return { state: "na", detail: "No selections on this job" };
      return s.selectionsOpen > 0
        ? { state: "open", detail: `${plural(s.selectionsOpen, "selection")} not approved`, action: "open_selections" }
        : { state: "done", detail: "All approved" };
    case "deposit":
      if (s.deposit.due <= 0.005) return { state: "na", detail: "No deposit on this job" };
      return s.deposit.paid + 0.005 >= s.deposit.due
        ? { state: "done", detail: `${money(s.deposit.due)} received` }
        : { state: "open", detail: `${money(s.deposit.paid)} of ${money(s.deposit.due)} received`, action: "record_payment" };
    case "materials":
      if (s.materials.tracked === 0) return { state: "na", detail: "No tracked materials" };
      return s.materials.short.length
        ? { state: "open", detail: `${plural(s.materials.short.length, "line")} not fully ordered`, action: "open_cost_plan" }
        : { state: "done", detail: `All ${plural(s.materials.tracked, "line")} ordered` };
    case "deliveries":
      if (s.materials.tracked === 0) return { state: "na", detail: "No tracked materials" };
      return s.deliveries.unscheduled.length
        ? { state: "open", detail: `${plural(s.deliveries.unscheduled.length, "line")} with no delivery by the start date`, action: "open_cost_plan" }
        : { state: "done", detail: "All expected by the start date" };
    case "crew":
      return s.crewName ? { state: "done", detail: s.crewName } : { state: "open", detail: "No crew assigned", action: "assign_crew" };
    case "start_confirmed":
      return s.startConfirmed
        ? { state: "done", detail: "Confirmed with the client" }
        : { state: "open", detail: "Not confirmed with the client yet", action: "send_start_confirmation" };
    default:
      return { state: "open", detail: "" };
  }
}

// ---------------------------------------------------------------------------
// 811 utility locate
// ---------------------------------------------------------------------------

export interface LocateDetails {
  ticket?: string;
  /** Date called / submitted (ISO). */
  submitted?: string;
  file?: string;
}

/** Clear to dig + expiry from the submitted date, in working days. A ticket
 * submitted on a weekend counts from the next working day. */
export function locateDates(submitted: string | null | undefined, s: PreconSettingsLike): { clearToDig: string; expires: string } | null {
  if (!submitted) return null;
  const base = isWorkingDay(submitted) ? submitted : addWorkingDays(submitted, 1);
  return { clearToDig: addWorkingDays(base, s.locate_wait_days), expires: addWorkingDays(base, s.locate_valid_days) };
}

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
};

/** 811 state + warnings for the job's dates. */
export function locateCheck(
  d: LocateDetails,
  project: { start: string | null; end: string | null },
  s: PreconSettingsLike,
  today: string,
): { state: ItemState; detail: string; warnings: string[]; clearToDig: string | null; expires: string | null } {
  const dates = locateDates(d.submitted, s);
  if (!d.ticket?.trim() || !dates) {
    return { state: "open", detail: d.ticket ? "Add the date it was submitted" : "No 811 ticket yet", warnings: [], clearToDig: null, expires: null };
  }
  const warnings: string[] = [];
  const end = project.end ?? project.start;
  if (dates.expires < today) warnings.push(`Ticket expired ${dayLabel(dates.expires)} — call in a new one`);
  else if (end && dates.expires < end) warnings.push(`Expires ${dayLabel(dates.expires)}, before the job ends ${dayLabel(end)} — refresh it`);
  if (project.start && project.start < dates.clearToDig) warnings.push(`Start ${dayLabel(project.start)} is before clear to dig ${dayLabel(dates.clearToDig)}`);
  return {
    state: warnings.length ? "open" : "done",
    detail: `#${d.ticket.trim()} · clear ${dayLabel(dates.clearToDig)} · expires ${dayLabel(dates.expires)}`,
    warnings,
    clearToDig: dates.clearToDig,
    expires: dates.expires,
  };
}

/** Rain delay preview: would the new end date outrun the 811 ticket? */
export function locateDelayWarning(d: LocateDetails | null | undefined, newEnd: string | null, s: PreconSettingsLike): string | null {
  const dates = locateDates(d?.submitted, s);
  if (!dates || !newEnd || dates.expires >= newEnd) return null;
  return `The 811 ticket${d?.ticket ? ` #${d.ticket}` : ""} expires ${dayLabel(dates.expires)} — before the new end ${dayLabel(newEnd)}. Refresh it.`;
}

/** 811 expiring within 3 working days of today while the job isn't done. */
export function locateExpiringSoon(expires: string | null, end: string | null, today: string): boolean {
  if (!expires || !end || expires >= end) return false;
  return expires <= addWorkingDays(today, 3);
}

// ---------------------------------------------------------------------------
// Items + readiness
// ---------------------------------------------------------------------------

export const PERMIT_STATUS_LABEL: Record<string, string> = { not_needed: "Not needed", submitted: "Submitted", approved: "Approved" };

export function itemView(
  item: PreconItemRow,
  signals: PreconSignals,
  project: { start: string | null; end: string | null },
  settings: PreconSettingsLike,
  today: string,
): ItemView {
  if (AUTO_KINDS.has(item.kind)) {
    const a = autoCheck(item.kind, signals);
    if (item.override) {
      return {
        item,
        state: item.status,
        auto: true,
        autoState: a.state,
        detail: item.note ? `Marked by hand — ${item.note}` : "Marked by hand",
        warnings: [],
        action: a.action,
      };
    }
    return { item, state: a.state, auto: true, detail: a.detail, warnings: [], action: a.action };
  }
  if (item.status === "na") return { item, state: "na", auto: false, detail: "N/A for this job", warnings: [] };
  if (item.kind === "locate") {
    const l = locateCheck(item.details as LocateDetails, project, settings, today);
    return { item, state: l.state, auto: false, detail: l.detail, warnings: l.warnings, action: "edit" };
  }
  if (item.kind === "hoa" || item.kind === "permit") {
    const st = String(item.details.status ?? "");
    const num = item.kind === "permit" && item.details.number ? ` #${item.details.number}` : "";
    const date = item.details.date ? ` · ${dayLabel(String(item.details.date))}` : "";
    if (st === "not_needed") return { item, state: "na", auto: false, detail: "Not needed", warnings: [], action: "edit" };
    if (st === "approved") return { item, state: "done", auto: false, detail: `Approved${num}${date}`, warnings: [], action: "edit" };
    return { item, state: "open", auto: false, detail: st === "submitted" ? `Submitted${num}${date}` : "Not started", warnings: [], action: "edit" };
  }
  return { item, state: item.status, auto: false, detail: item.note ?? "", warnings: [] };
}

export type ReadinessStatus = "ready" | "open" | "blocked";

export interface Readiness {
  views: ItemView[];
  done: number;
  total: number;
  openRequired: ItemView[];
  status: ReadinessStatus;
  daysToStart: number | null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);

/**
 * Ready = every required item done (or N/A). Blocked = a required item is
 * still open inside the reminder window (or the start has passed). Open =
 * anything else with required items left.
 */
export function readiness(
  items: PreconItemRow[],
  signals: PreconSignals,
  project: { start: string | null; end: string | null },
  settings: PreconSettingsLike,
  today: string = isoDate(new Date()),
): Readiness {
  const views = items
    .filter((i) => !i.removed)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => itemView(i, signals, project, settings, today));
  const counted = views.filter((v) => v.state !== "na");
  const openRequired = views.filter((v) => v.item.required && v.state === "open");
  const daysToStart = project.start ? daysBetween(today, project.start) : null;
  const status: ReadinessStatus =
    openRequired.length === 0 ? "ready" : daysToStart != null && daysToStart <= settings.warn_days ? "blocked" : "open";
  return { views, done: counted.filter((v) => v.state === "done").length, total: counted.length, openRequired, status, daysToStart };
}

/** "811 ticket and deposit still open" */
export function openSummary(open: ItemView[]): string {
  const names = open.map((v) => (v.item.kind === "locate" ? "811 ticket" : v.item.label.charAt(0).toLowerCase() + v.item.label.slice(1)));
  if (names.length === 0) return "";
  if (names.length === 1) return `${capitalize(names[0])} still open`;
  if (names.length === 2) return `${capitalize(names[0])} and ${names[1]} still open`;
  return `${capitalize(names[0])}, ${names[1]} and ${names.length - 2} more still open`;
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where the checklist shows: from Won until the job has actually started. */
export function preconPhase(p: { status: string; actual_start_date: string | null }): "before" | "started" | "hidden" {
  if (p.status === "estimating" || p.status === "lost" || p.status === "complete") return "hidden";
  return p.actual_start_date || p.status === "in_progress" ? "started" : "before";
}

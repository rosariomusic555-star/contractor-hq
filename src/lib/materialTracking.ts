/**
 * Material budget tracking (0080) — turns a material sheet from a one-time
 * estimate into a live budget: Estimated (baseline) / Ordered / Delivered /
 * Used, per line, for a project's TRACKED sheets only. Ordered/Delivered/
 * Used are always computed here from their source records (delivery lines,
 * usage logs) — never stored, so they can't drift.
 *
 * A sheet tracks when it's linked to the project's signed (approved) quote,
 * or to an approved change order — see trackedSheetIds(). Everything below
 * is a pure function over already-fetched data, same convention as
 * financials.ts, so a card and its detail page can never disagree.
 */

import type {
  ChangeOrder,
  MaterialOrderItem,
  MaterialOrderStatus,
  MaterialsItem,
  MaterialsSection,
  MaterialsUsageLog,
  Project,
  Quote,
} from "./api";
import { projectDurationStatus } from "./projectDuration";

// ---------------------------------------------------------------------------
// Which sheets track
// ---------------------------------------------------------------------------

/** The sheet ids that track for a project right now: the one linked to its
 * signed (approved) quote, plus any linked to an approved change order.
 * Deliberately NOT pickHeadlineQuote — a sent/draft quote's sheet never
 * tracks, only an actually-signed one. */
export function trackedSheetIds(quotes: Quote[], changeOrders: ChangeOrder[]): Set<string> {
  const ids = new Set<string>();
  const signedQuote = quotes.find((q) => q.status === "approved");
  if (signedQuote?.material_sheet_id) ids.add(signedQuote.material_sheet_id);
  for (const co of changeOrders) {
    if (co.status === "approved" && co.material_sheet_id) ids.add(co.material_sheet_id);
  }
  return ids;
}

/** A project tracks at all once it's past Estimating (mirrors
 * isExcludedFromFinancials's own "estimating or lost" test in
 * financials.ts) — Estimating/Lost projects show no tracking UI regardless
 * of what's linked. */
export function projectTracksMaterials(status: Project["status"]): boolean {
  return status !== "estimating" && status !== "lost";
}

// ---------------------------------------------------------------------------
// Units — same-unit fast path, or a conversion defined on the line.
// ---------------------------------------------------------------------------

/** Aliases the fixed 6-value delivery unit vocabulary (material_order_items.
 * unit) onto the free-text sheet-line vocabulary so "cubic_yard" on a
 * delivery matches "cy" on a sheet line without needing a conversion for
 * what's really the same unit. Extend as real mismatches turn up. */
const UNIT_ALIASES: Record<string, string> = {
  ton: "ton",
  tons: "ton",
  t: "ton",
  cubic_yard: "cy",
  cy: "cy",
  yd: "cy",
  yd3: "cy",
  yard: "cy",
  yards: "cy",
  linear_foot: "lf",
  lf: "lf",
  "linear foot": "lf",
  "linear feet": "lf",
  bag: "bag",
  bags: "bag",
  pallet: "pallet",
  pallets: "pallet",
  each: "ea",
  ea: "ea",
  pc: "ea",
  sf: "sf",
  "sq ft": "sf",
  sqft: "sf",
  "square foot": "sf",
  "square feet": "sf",
};

function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const key = unit.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? key;
}

export function unitsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  return na != null && na === nb;
}

// ---------------------------------------------------------------------------
// Delivery line -> sheet line auto-suggest (Phase 2) — word-overlap
// scoring, no fuzzy-match dependency. "Suggest automatically... let me
// confirm it" per spec: this never auto-matches, it only ranks candidates
// for the picker to default to.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(["the", "a", "an", "of", "for", "and", "or"]);

function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/** Ranks a project's sheet lines by how closely their name matches a
 * delivery line's typed description — plain word overlap (Jaccard-ish),
 * good enough to default a picker to the right line for "Techo-Bloc Blu
 * 60mm" matching a sheet line named "Techo-Bloc Blu Pavers 60mm" without
 * pulling in a fuzzy-matching library. Returns [] when nothing shares a
 * word at all (never suggests a wrong line just to suggest something). */
export function suggestMaterialsItemMatches(
  description: string,
  candidates: MaterialsItem[],
  limit = 3,
): MaterialsItem[] {
  const target = wordsOf(description);
  if (target.size === 0) return [];
  const scored = candidates
    .map((c) => {
      const words = wordsOf(c.name);
      const overlap = [...target].filter((w) => words.has(w)).length;
      return { c, score: overlap / Math.max(1, target.size) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.c);
}

/** Converts a quantity logged in `fromUnit` into the sheet line's own unit,
 * or null when it can't be — either the units already match (no conversion
 * needed, this never returns null in that case) or the line defines "1
 * conversion_unit = conversion_factor x unit" and fromUnit matches
 * conversion_unit. Null means the UI must prompt for a conversion — never
 * silently drop or mis-sum the quantity. */
export function convertToSheetUnit(
  quantity: number,
  fromUnit: string | null | undefined,
  line: Pick<MaterialsItem, "unit" | "conversion_unit" | "conversion_factor">,
): number | null {
  if (unitsMatch(fromUnit, line.unit)) return quantity;
  if (line.conversion_unit && line.conversion_factor && unitsMatch(fromUnit, line.conversion_unit)) {
    return quantity * line.conversion_factor;
  }
  return null;
}

/** Prefills a line's conversion from whichever source it's linked to —
 * Price Book's coverage_per_pallet_sqft/coverage_per_bag_sqft, or Product
 * Catalog's coverage_per_unit x units_per_package (assumed sold by the
 * pallet, the common case) — so picking a cataloged paver already knows
 * "1 pallet = 108 sf" without the contractor typing it in. Returns null
 * when the linked source has no coverage data to prefill from. */
export function prefillConversion(
  source:
    | { kind: "price_book"; coverage_per_pallet_sqft?: number; coverage_per_bag_sqft?: number }
    | { kind: "catalog"; coverage_per_unit?: number; units_per_package?: number }
    | null,
): { conversion_unit: string; conversion_factor: number } | null {
  if (!source) return null;
  if (source.kind === "price_book") {
    if (source.coverage_per_pallet_sqft) return { conversion_unit: "pallet", conversion_factor: source.coverage_per_pallet_sqft };
    if (source.coverage_per_bag_sqft) return { conversion_unit: "bag", conversion_factor: source.coverage_per_bag_sqft };
    return null;
  }
  if (source.coverage_per_unit && source.units_per_package) {
    return { conversion_unit: "pallet", conversion_factor: source.coverage_per_unit * source.units_per_package };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-line rollups — Ordered / Delivered / Used, in the line's own unit.
// ---------------------------------------------------------------------------

/** An order item's effective status: its own override if set, else the
 * parent order's status — see material_order_items.status's own doc
 * comment (api.ts) for why this is nullable-inherit rather than always
 * populated. */
export function effectiveDeliveryStatus(
  item: Pick<MaterialOrderItem, "status">,
  orderStatus: MaterialOrderStatus,
): MaterialOrderStatus {
  return item.status ?? orderStatus;
}

/** Every delivery line matched to this sheet line, across every order on
 * the project — callers pass the full order-item list plus a lookup from
 * material_order_item -> its parent order's status (order status isn't on
 * the item itself). */
export interface DeliveryLineWithOrderStatus {
  item: MaterialOrderItem;
  orderStatus: MaterialOrderStatus;
}

function convertedOrZero(qty: number, unit: string | null | undefined, line: MaterialsItem): number {
  const converted = convertToSheetUnit(qty, unit, line);
  return converted ?? 0; // an unconverted mismatch contributes nothing until resolved — never guessed
}

/** Sum of every matched delivery line's quantity, in the sheet line's own
 * unit — "ordered or later" (ordered/delivered/delayed all mean an order
 * was placed), regardless of current status. */
export function orderedQuantity(line: MaterialsItem, deliveries: DeliveryLineWithOrderStatus[]): number {
  return deliveries
    .filter((d) => d.item.materials_item_id === line.id)
    .reduce((sum, d) => sum + convertedOrZero(d.item.quantity, d.item.unit, line), 0);
}

/** Sum of matched delivery lines whose effective status is specifically
 * 'delivered'. */
export function deliveredQuantity(line: MaterialsItem, deliveries: DeliveryLineWithOrderStatus[]): number {
  return deliveries
    .filter((d) => d.item.materials_item_id === line.id && effectiveDeliveryStatus(d.item, d.orderStatus) === "delivered")
    .reduce((sum, d) => sum + convertedOrZero(d.item.quantity, d.item.unit, line), 0);
}

/** Sum of every usage log entry against this line — usage is always
 * logged in the line's own unit (no conversion needed; there's no
 * "ordering unit" for usage). */
export function usedQuantity(line: MaterialsItem, usageLogs: MaterialsUsageLog[]): number {
  return usageLogs.filter((u) => u.materials_item_id === line.id).reduce((sum, u) => sum + Number(u.quantity), 0);
}

/** The line's current baseline (its most recent snapshot) — null for an
 * untracked line, or a tracked one whose baseline trigger genuinely hasn't
 * fired yet (shouldn't happen once 0080's backfill has run, but never
 * assumed). */
export function currentBaseline(line: Pick<MaterialsItem, "materials_item_baselines">): {
  quantity: number;
  unit_cost: number;
  unit: string | null;
} | null {
  const latest = line.materials_item_baselines?.[0];
  if (!latest) return null;
  return { quantity: Number(latest.quantity), unit_cost: Number(latest.unit_cost), unit: latest.unit };
}

export type LineStatus = "not_ordered" | "ordered" | "delivered" | "in_use" | "used_up" | "over_estimate";

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  not_ordered: "Not ordered",
  ordered: "Ordered",
  delivered: "Delivered",
  in_use: "In use",
  used_up: "Used up",
  over_estimate: "Over estimate",
};

/** One status per line even though several of these conditions can be true
 * at once — priority order below, most-actionable/most-surprising first.
 * "Over estimate" (used already exceeds the baseline) always wins, since
 * it's the one that needs attention regardless of where the line otherwise
 * sits in its lifecycle. */
export function lineStatus(estimated: number, ordered: number, delivered: number, used: number): LineStatus {
  if (estimated > 0 && used > estimated) return "over_estimate";
  if (delivered > 0 && used >= delivered) return "used_up";
  if (used > 0) return "in_use";
  if (delivered > 0) return "delivered";
  if (ordered > 0) return "ordered";
  return "not_ordered";
}

// ---------------------------------------------------------------------------
// Cost — actual vs. baseline, including Unplanned deliveries.
// ---------------------------------------------------------------------------

/** A tracked line's actual cost to date: each matched, delivered order
 * item's quantity (in the sheet line's own unit) x its own actual price,
 * falling back to the sheet's estimated unit_cost when no price was
 * entered on that delivery — per the spec's exact fallback rule. */
export function lineActualCost(line: MaterialsItem, deliveries: DeliveryLineWithOrderStatus[]): number {
  return deliveries
    .filter((d) => d.item.materials_item_id === line.id && effectiveDeliveryStatus(d.item, d.orderStatus) === "delivered")
    .reduce((sum, d) => {
      const qty = convertedOrZero(d.item.quantity, d.item.unit, line);
      const price = d.item.unit_price != null ? Number(d.item.unit_price) : line.unit_cost;
      return sum + qty * price;
    }, 0);
}

/** Delivered, unmatched ("Unplanned") lines' cost — counted in actual cost
 * per spec ("never drop them"), at whatever price was entered; a delivered
 * unplanned line with no price entered contributes $0 (never guessed),
 * same as any other missing-price case in this app. */
export function unplannedActualCost(deliveries: DeliveryLineWithOrderStatus[]): number {
  return deliveries
    .filter((d) => d.item.materials_item_id == null && effectiveDeliveryStatus(d.item, d.orderStatus) === "delivered")
    .reduce((sum, d) => sum + Number(d.item.quantity) * (d.item.unit_price != null ? Number(d.item.unit_price) : 0), 0);
}

export interface SheetCostSummary {
  /** Sum of every tracked line's baseline quantity x baseline unit_cost. */
  estimatedCost: number;
  /** Every tracked line's actual cost + Unplanned deliveries' cost, minus
   * any reconciled return credits. */
  actualCost: number;
  varianceDollars: number;
  /** Positive = over budget. Null when estimatedCost is 0 (nothing to
   * compare a percentage against). */
  variancePct: number | null;
  notOrderedCount: number;
  overEstimateCount: number;
  /** Distinct delivery lines with no sheet match. */
  unplannedCount: number;
}

/** The sheet-level summary card (Phase 4) and the project page's compact
 * Materials card both read this same function, so they can never disagree.
 * `trackedLines` = every materials_items row across the sheet's sections
 * (already the tracked sheet — caller filters by trackedSheetIds first).
 * `deliveries` = every material_order_item on the project, each paired
 * with its parent order's status (see DeliveryLineWithOrderStatus). */
export function sheetCostSummary(
  trackedLines: MaterialsItem[],
  deliveries: DeliveryLineWithOrderStatus[],
  usageLogs: MaterialsUsageLog[],
): SheetCostSummary {
  let estimatedCost = 0;
  let actualCost = unplannedActualCost(deliveries);
  let notOrderedCount = 0;
  let overEstimateCount = 0;

  for (const line of trackedLines) {
    const baseline = currentBaseline(line);
    const estQty = baseline?.quantity ?? 0;
    const estCost = baseline?.unit_cost ?? 0;
    estimatedCost += estQty * estCost;

    const ordered = orderedQuantity(line, deliveries);
    const delivered = deliveredQuantity(line, deliveries);
    const used = usedQuantity(line, usageLogs);
    const status = lineStatus(estQty, ordered, delivered, used);
    if (status === "not_ordered") notOrderedCount++;
    if (status === "over_estimate") overEstimateCount++;

    actualCost += lineActualCost(line, deliveries);
    if (line.reconciled_at && line.disposition === "returned" && line.return_credit) {
      actualCost -= Number(line.return_credit);
    }
  }

  const unplannedCount = new Set(
    deliveries.filter((d) => d.item.materials_item_id == null).map((d) => d.item.id),
  ).size;

  const varianceDollars = actualCost - estimatedCost;
  const variancePct = estimatedCost > 0 ? (varianceDollars / estimatedCost) * 100 : null;

  return { estimatedCost, actualCost, varianceDollars, variancePct, notOrderedCount, overEstimateCount, unplannedCount };
}

// ---------------------------------------------------------------------------
// Early warnings (Phase 5) — informational only, never blocking.
// ---------------------------------------------------------------------------

export type MaterialAlertKind = "burn_rate" | "over_order" | "not_ordered";

export interface MaterialAlert {
  key: MaterialAlertKind;
  lineName: string;
  label: string;
}

/** How far ahead of job progress a line's usage % needs to be before it's
 * worth flagging — not contractor-configurable per spec (only the
 * over-order margin and not-ordered days are). */
const BURN_RATE_ALERT_MARGIN_PP = 20;

/** Every alert currently live for a tracked sheet's lines. Burn-rate only
 * evaluates once the project actually has an estimated duration AND has
 * started (projectDurationStatus's 'in_progress' state) — no estimate, no
 * start date, no burn-rate read, per spec. Not-ordered needs a scheduled
 * start date to measure "within N days of" against; no date, no alert. */
export function materialAlerts(
  project: Pick<Project, "estimated_duration_days" | "actual_start_date" | "actual_end_date" | "scheduled_start_date">,
  trackedLines: MaterialsItem[],
  deliveries: DeliveryLineWithOrderStatus[],
  usageLogs: MaterialsUsageLog[],
  settings: { overOrderMarginPct: number; notOrderedAlertDays: number },
  now: Date = new Date(),
): MaterialAlert[] {
  const alerts: MaterialAlert[] = [];
  const duration = projectDurationStatus(project, now);
  const jobProgressPct = duration.state === "in_progress" ? (duration.elapsedDays / duration.estimateDays) * 100 : null;

  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const daysUntilStart = project.scheduled_start_date
    ? Math.round((new Date(`${project.scheduled_start_date}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86_400_000)
    : null;

  for (const line of trackedLines) {
    const baseline = currentBaseline(line);
    const estimated = baseline?.quantity ?? 0;
    const ordered = orderedQuantity(line, deliveries);
    const used = usedQuantity(line, usageLogs);

    if (jobProgressPct != null && estimated > 0) {
      const usagePct = (used / estimated) * 100;
      if (usagePct - jobProgressPct > BURN_RATE_ALERT_MARGIN_PP) {
        alerts.push({
          key: "burn_rate",
          lineName: line.name,
          label: `${line.name} ${Math.round(usagePct)}% used, job ${Math.round(jobProgressPct)}% through`,
        });
      }
    }

    if (estimated > 0 && ordered > estimated * (1 + settings.overOrderMarginPct / 100)) {
      const overPct = Math.round(((ordered - estimated) / estimated) * 100);
      alerts.push({ key: "over_order", lineName: line.name, label: `${line.name} ordered ${overPct}% over estimate` });
    }

    if (ordered === 0 && daysUntilStart != null && daysUntilStart <= settings.notOrderedAlertDays) {
      alerts.push({
        key: "not_ordered",
        lineName: line.name,
        label:
          daysUntilStart < 0
            ? `${line.name} still not ordered — job started ${Math.abs(daysUntilStart)}d ago`
            : `${line.name} still not ordered — starts in ${daysUntilStart}d`,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Close-out reconciliation (Phase 6)
// ---------------------------------------------------------------------------

/** Delivered - Used, floored at 0 — what a reconciliation prompt needs to
 * account for per line. Negative (used more than delivered, e.g. a
 * cross-project reuse or a delivery logged late) reads as "nothing left",
 * never a negative leftover. */
export function leftoverQuantity(delivered: number, used: number): number {
  return Math.max(0, delivered - used);
}

/** Whether a tracked sheet still has lines to reconcile — Delivered != Used
 * and not yet marked reconciled. Drives the "Reconcile materials" reminder
 * that lingers on the project until this is empty. */
export function needsReconciliation(
  trackedLines: MaterialsItem[],
  deliveries: DeliveryLineWithOrderStatus[],
  usageLogs: MaterialsUsageLog[],
): MaterialsItem[] {
  return trackedLines.filter((line) => {
    if (line.reconciled_at) return false;
    const delivered = deliveredQuantity(line, deliveries);
    const used = usedQuantity(line, usageLogs);
    return delivered !== used;
  });
}

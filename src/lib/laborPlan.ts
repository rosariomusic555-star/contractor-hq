/**
 * Labor Plan + Labor Tracking (0085) — planned labor hours/cost per job
 * category ("scope"), the actual hours logged against it once the job
 * runs, and the planned-vs-actual/productivity math both the Labor page
 * and the project page's compact cards read. Pure functions over
 * already-fetched data, same convention as materialTracking.ts, so a card
 * and its detail page can never disagree.
 *
 * Scope = the project's existing Job Categories (public.categories) —
 * category_id null reads as "General" (whole-job labor not tied to one
 * scope), not a special/uncategorized case to filter out.
 */

import type { Category, LaborEntry, LaborPlanEntry } from "./api";

export const GENERAL_SCOPE_KEY = "__general__";

const scopeKey = (categoryId: string | null): string => categoryId ?? GENERAL_SCOPE_KEY;

export interface ScopeLaborRollup {
  categoryId: string | null;
  categoryName: string;
  plannedHours: number;
  plannedCost: number;
  actualHours: number;
  actualCost: number;
  varianceHours: number;
  varianceCost: number;
  /** (actual - planned) / planned hours, as a percent. Null when nothing
   * was planned (no baseline to compare against — never shown as "0% over"). */
  variancePct: number | null;
}

/** One rollup per scope that has EITHER a plan entry or at least one
 * actual labor entry — a scope with neither never appears (nothing to
 * show). Sorted by planned cost descending, with the General ("no scope")
 * row always last since it reads as the catch-all, not a primary scope. */
export function laborRollupsByScope(
  planEntries: LaborPlanEntry[],
  actualEntries: LaborEntry[],
  categories: Category[],
): ScopeLaborRollup[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const keys = new Set<string>();
  for (const e of planEntries) keys.add(scopeKey(e.category_id));
  for (const e of actualEntries) keys.add(scopeKey(e.category_id));

  const rollups = [...keys].map((key): ScopeLaborRollup => {
    const categoryId = key === GENERAL_SCOPE_KEY ? null : key;
    const plans = planEntries.filter((e) => scopeKey(e.category_id) === key);
    const actuals = actualEntries.filter((e) => scopeKey(e.category_id) === key);
    const plannedHours = plans.reduce((s, e) => s + Number(e.planned_hours ?? 0), 0);
    const plannedCost = plans.reduce((s, e) => s + Number(e.planned_cost ?? 0), 0);
    const actualHours = actuals.reduce((s, e) => s + Number(e.hours), 0);
    const actualCost = actuals.reduce((s, e) => s + Number(e.cost), 0);
    return {
      categoryId,
      categoryName: categoryId ? (nameById.get(categoryId) ?? "Uncategorized") : "General",
      plannedHours,
      plannedCost,
      actualHours,
      actualCost,
      varianceHours: actualHours - plannedHours,
      varianceCost: actualCost - plannedCost,
      variancePct: plannedHours > 0 ? ((actualHours - plannedHours) / plannedHours) * 100 : null,
    };
  });

  return rollups.sort((a, b) => {
    if (a.categoryId === null) return 1;
    if (b.categoryId === null) return -1;
    return b.plannedCost - a.plannedCost || b.actualCost - a.actualCost;
  });
}

export interface LaborTotals {
  plannedHours: number;
  plannedCost: number;
  actualHours: number;
  actualCost: number;
  varianceHours: number;
  varianceCost: number;
  variancePct: number | null;
}

/** Whole-project totals — always sum the rollups rather than the raw
 * entry arrays directly, so a caller filtering rollups (e.g. by scope)
 * gets consistent totals for free. */
export function laborTotals(rollups: ScopeLaborRollup[]): LaborTotals {
  const plannedHours = rollups.reduce((s, r) => s + r.plannedHours, 0);
  const plannedCost = rollups.reduce((s, r) => s + r.plannedCost, 0);
  const actualHours = rollups.reduce((s, r) => s + r.actualHours, 0);
  const actualCost = rollups.reduce((s, r) => s + r.actualCost, 0);
  return {
    plannedHours,
    plannedCost,
    actualHours,
    actualCost,
    varianceHours: actualHours - plannedHours,
    varianceCost: actualCost - plannedCost,
    variancePct: plannedHours > 0 ? ((actualHours - plannedHours) / plannedHours) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// Project size / productivity metrics
// ---------------------------------------------------------------------------

export interface ProductivityMetrics {
  sizeSqft: number;
  plannedHoursPer100Sqft: number | null;
  actualHoursPer100Sqft: number | null;
  plannedCostPerSqft: number | null;
  actualCostPerSqft: number | null;
  /** Actual sq ft produced per actual labor hour — a throughput read, the
   * inverse of hours/100sf but framed the way a foreman actually thinks
   * about it ("how much are we getting done per hour"). */
  sqftPerActualLaborHour: number | null;
}

/** Null when the project has no size set yet — the whole productivity
 * section simply doesn't render rather than showing a division-by-zero or
 * a misleading 0. */
export function productivityMetrics(sizeSqft: number | null | undefined, totals: LaborTotals): ProductivityMetrics | null {
  if (!sizeSqft || sizeSqft <= 0) return null;
  return {
    sizeSqft,
    plannedHoursPer100Sqft: totals.plannedHours > 0 ? (totals.plannedHours / sizeSqft) * 100 : null,
    actualHoursPer100Sqft: totals.actualHours > 0 ? (totals.actualHours / sizeSqft) * 100 : null,
    plannedCostPerSqft: totals.plannedCost > 0 ? totals.plannedCost / sizeSqft : null,
    actualCostPerSqft: totals.actualCost > 0 ? totals.actualCost / sizeSqft : null,
    sqftPerActualLaborHour: totals.actualHours > 0 ? sizeSqft / totals.actualHours : null,
  };
}

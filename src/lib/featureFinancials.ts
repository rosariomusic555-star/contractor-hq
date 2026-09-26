import type { Category, ChangeOrder, Expense, ExpenseCategory, LaborEntry, Quote } from "./api";
import { quoteTotal } from "./api";
import { COST_BUCKETS, sumSectionTotals, type CostBucket, type CostSection, type CostTotals } from "./costPlanMath";
import { expenseBucket } from "./costPlan";
import { activeFeatures, featureName, type ProjectFeature } from "./features";

/**
 * Per-feature money (0105-0109). A feature's customer price is its sections
 * on approved quotes (the original and add-ons) plus its sections on approved
 * change orders; its cost comes from its Cost plan section(s). Pure — over
 * already-fetched rows, so the Cost plan, the history dialog and the Profit
 * Summary never disagree. Same line math as quoteTotal / changeOrderTotal.
 */

/** A feature's customer price from its approved quote and change order sections. */
export function featurePrice(featureId: string, quotes: Quote[], changeOrders: ChangeOrder[]): number {
  let total = 0;
  for (const q of quotes) {
    if (q.status !== "approved") continue;
    const sections = q.quote_sections.filter((s) => s.feature_id === featureId);
    if (sections.length) total += quoteTotal(sections);
  }
  for (const co of changeOrders) {
    if (co.status !== "approved") continue;
    for (const s of co.change_order_sections ?? []) {
      if (s.feature_id !== featureId) continue;
      for (const i of s.change_order_items ?? []) total += Number(i.price) * (i.quantity == null ? 1 : Number(i.quantity));
    }
  }
  return total;
}

/** "CO #n" — 1-based in creation order within the project (matches SQL change_order_number). */
export function changeOrderNumbers(changeOrders: Pick<ChangeOrder, "id" | "created_at">[]): Map<string, number> {
  const sorted = [...changeOrders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Map(sorted.map((co, i) => [co.id, i + 1]));
}

/** "Add-on quote #n" — 1-based in creation order among a project's add-ons. */
export function addonQuoteNumbers(quotes: Pick<Quote, "id" | "created_at" | "kind">[]): Map<string, number> {
  const sorted = quotes.filter((q) => q.kind === "addon").sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Map(sorted.map((q, i) => [q.id, i + 1]));
}

// ---------------------------------------------------------------------------
// Planned vs actual, per feature (Phase E)
// ---------------------------------------------------------------------------


const zero = (): CostTotals => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0, total: 0 });

export interface FeatureReport {
  /** Null = General: project-wide costs, untagged spend, and quote /
   * change order sections that aren't a feature. */
  featureId: string | null;
  name: string;
  planned: CostTotals;
  actual: CostTotals;
  /** Customer price: original quote + approved add-ons + approved COs. */
  price: number;
  /** actual − planned (positive = over plan). */
  varianceCost: number;
  variancePct: number | null;
  plannedProfit: number;
  actualProfit: number;
  plannedMarginPct: number | null;
  actualMarginPct: number | null;
}

/**
 * One row per active feature plus General, in feature order. Planned = the
 * feature's Cost plan section(s) by type; actual = expenses (or split lines)
 * tagged with it by their own cost type or else their category's, labor
 * logged against it, and — when the caller passes it — its reconciled
 * material cost. Rows always add up to the project's totals: spend on a
 * feature that isn't active (removed / still proposed) counts under General.
 */
export function featureReports(input: {
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  sections: (CostSection & { feature_id?: string | null })[];
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  expenses: Pick<Expense, "amount" | "expense_category_id" | "expense_lines" | "cost_type" | "feature_id">[];
  expenseCategories: Pick<ExpenseCategory, "id" | "cost_type">[];
  laborEntries: Pick<LaborEntry, "cost" | "feature_id">[];
  /** Reconciled material cost per feature id (null key = General). */
  materialActual?: Map<string | null, number>;
}): FeatureReport[] {
  const live = activeFeatures(input.features);
  const liveIds = new Set(live.map((f) => f.id));
  const keyOf = (id: string | null | undefined) => (id && liveIds.has(id) ? id : null);

  const actual = new Map<string | null, CostTotals>();
  const add = (fid: string | null | undefined, bucket: CostBucket, amount: number) => {
    const k = keyOf(fid);
    const t = actual.get(k) ?? zero();
    t[bucket] += amount;
    actual.set(k, t);
  };
  for (const e of input.expenses) {
    const lines = e.expense_lines ?? [];
    if (lines.length > 1) {
      for (const l of lines) add(l.feature_id, l.cost_type ?? expenseBucket(l.expense_category_id, input.expenseCategories), Number(l.amount) || 0);
    } else {
      add(e.feature_id, e.cost_type ?? expenseBucket(e.expense_category_id, input.expenseCategories), Number(e.amount) || 0);
    }
  }
  for (const l of input.laborEntries) add(l.feature_id, "labor", Number(l.cost) || 0);
  for (const [fid, amount] of input.materialActual ?? []) add(fid, "material", amount);

  // General's price: approved quote / CO sections that aren't an active feature.
  const featurePriceTotal = live.reduce((s, f) => s + featurePrice(f.id, input.quotes, input.changeOrders), 0);
  const allPrice =
    input.quotes.filter((q) => q.status === "approved").reduce((s, q) => s + quoteTotal(q.quote_sections), 0) +
    input.changeOrders
      .filter((co) => co.status === "approved")
      .reduce(
        (s, co) =>
          s +
          (co.change_order_sections ?? []).reduce(
            (a, sec) => a + (sec.change_order_items ?? []).reduce((b, i) => b + Number(i.price) * (i.quantity == null ? 1 : Number(i.quantity)), 0),
            0,
          ),
        0,
      );

  const row = (featureId: string | null, name: string, price: number): FeatureReport => {
    const planned = sumSectionTotals(
      input.sections.filter((s) => keyOf(s.feature_id) === featureId && (featureId !== null || !s.feature || s.feature.status === "active")),
      { all: featureId !== null },
    );
    const act = actual.get(featureId) ?? zero();
    act.total = COST_BUCKETS.reduce((s, k) => s + act[k], 0);
    const varianceCost = act.total - planned.total;
    const plannedProfit = price - planned.total;
    const actualProfit = price - act.total;
    return {
      featureId,
      name,
      planned,
      actual: act,
      price,
      varianceCost,
      variancePct: planned.total > 0 ? (varianceCost / planned.total) * 100 : null,
      plannedProfit,
      actualProfit,
      plannedMarginPct: price > 0 ? (plannedProfit / price) * 100 : null,
      actualMarginPct: price > 0 ? (actualProfit / price) * 100 : null,
    };
  };

  return [
    ...live.map((f) => row(f.id, featureName(f, input.categories), featurePrice(f.id, input.quotes, input.changeOrders))),
    row(null, "General", Math.max(0, allPrice - featurePriceTotal)),
  ];
}

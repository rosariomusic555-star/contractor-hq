/**
 * Cost plan roll-up for a project's Profit Summary — planned vs actual, by
 * cost type:
 *
 *   Quote -> Cost plan (sections: typed lines + labor blocks) -> Actual
 *   materials + labor + expenses -> Actual profit
 *
 * Planned = the project's Cost plan sections (costPlanMath.sumSectionTotals).
 * Actual  = expenses by their own cost_type (0109) or else their expense
 *           category's cost_type (0103; split expenses per line), + actual labor logged
 *           on the Labor log, + reconciled material cost once a job is
 *           Complete. Pure functions over already-fetched data.
 */

import type { ChangeOrder, Expense, ExpenseCategory, Quote } from "./api";
import { pendingSelectionsCost, pickHeadlineQuote, projectContractValue } from "./api";
import { COST_BUCKETS, sumSectionTotals, type CostBucket, type CostSection, type CostTotals } from "./costPlanMath";

const zero = (): CostTotals => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0, total: 0, tax: 0, subtotal: 0 });

/** Which bucket an expense category's spend counts toward. Uncategorized
 * spend (or a category from before 0103) counts as "other" — it's real
 * money out, just not attributable. */
export function expenseBucket(categoryId: string | null, categories: Pick<ExpenseCategory, "id" | "cost_type">[]): CostBucket {
  if (!categoryId) return "other";
  return categories.find((c) => c.id === categoryId)?.cost_type ?? "material";
}

/** Actual cost by type: expenses (split per line when split), actual labor
 * entries, and — once reconciled — the tracked material actual. */
export function actualCostByType(
  expenses: Pick<Expense, "amount" | "expense_category_id" | "expense_lines" | "cost_type">[],
  categories: Pick<ExpenseCategory, "id" | "cost_type">[],
  laborActual = 0,
  materialActual = 0,
): CostTotals {
  const t = zero();
  for (const e of expenses) {
    const lines = e.expense_lines ?? [];
    if (lines.length > 1) {
      for (const l of lines) t[l.cost_type ?? expenseBucket(l.expense_category_id, categories)] += Number(l.amount) || 0;
    } else {
      t[e.cost_type ?? expenseBucket(e.expense_category_id, categories)] += Number(e.amount) || 0;
    }
  }
  t.labor += laborActual;
  t.material += materialActual;
  t.total = COST_BUCKETS.reduce((s, k) => s + t[k], 0);
  return t;
}

export interface CostPlanSummary {
  contractValue: number;
  planned: CostTotals;
  /** Null when there's no contract value yet to compare against. */
  projectedProfit: number | null;
  projectedMarginPct: number | null;
  /** Client picks on the not-yet-approved headline quote — in the contract
   * value already, so counted in planned "other" here (where their
   * "Selection:" lines land on approval). */
  pendingSelections: number;
}

export function costPlanSummary(quotes: Quote[], changeOrders: ChangeOrder[], sections: CostSection[]): CostPlanSummary {
  const contractValue = projectContractValue(quotes, changeOrders);
  const pendingSelections = pendingSelectionsCost(pickHeadlineQuote(quotes));
  const planned = sumSectionTotals(sections);
  if (pendingSelections) {
    planned.other += pendingSelections;
    planned.total += pendingSelections;
  }
  const projectedProfit = contractValue > 0 ? contractValue - planned.total : null;
  const projectedMarginPct = projectedProfit !== null && contractValue > 0 ? (projectedProfit / contractValue) * 100 : null;
  return { contractValue, planned, projectedProfit, projectedMarginPct, pendingSelections };
}

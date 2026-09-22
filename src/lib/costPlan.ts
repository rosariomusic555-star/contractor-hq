/**
 * Cost Plan (0085) — the project's predicted job cost, the source of truth
 * every other "predicted cost" figure in the app should agree with:
 *
 *   Quote -> Cost Plan -> Material Plan / Labor Plan -> Actual Materials +
 *   Labor + Expenses -> Actual Profit
 *
 * Materials and Labor are never re-entered here — they're read live from
 * the Materials Sheet (materialTracking.ts's predictedMaterialCost) and
 * the Labor Plan (laborPlan.ts's laborTotals) respectively. This module
 * only owns the three manual groups (Subcontractor/Equipment/Other,
 * cost_plan_items) and the roll-up math that combines all five into one
 * summary. Pure functions over already-fetched data, same convention as
 * financials.ts/materialTracking.ts, so the project page's compact card
 * and the full Cost Plan page can never disagree.
 */

import type { ChangeOrder, CostPlanGroup, CostPlanItem, Quote } from "./api";
import { projectContractValue } from "./api";

export const COST_PLAN_GROUPS: CostPlanGroup[] = ["subcontractor", "equipment", "other"];

export const COST_PLAN_GROUP_LABELS: Record<CostPlanGroup, string> = {
  subcontractor: "Subcontractors",
  equipment: "Equipment",
  other: "Other",
};

export function costPlanGroupItems(items: CostPlanItem[], group: CostPlanGroup): CostPlanItem[] {
  return items.filter((i) => i.group === group);
}

export function costPlanGroupTotal(items: CostPlanItem[], group: CostPlanGroup): number {
  return costPlanGroupItems(items, group).reduce((s, i) => s + Number(i.planned_cost), 0);
}

export interface CostPlanSummary {
  contractValue: number;
  /** Null = no materials sheet started yet ("not started," never $0 —
   * see predictedMaterialCost's own doc comment). */
  materialCost: number | null;
  laborCost: number;
  subcontractorCost: number;
  equipmentCost: number;
  otherCost: number;
  totalPlannedCost: number;
  /** Null when there's no contract value yet to compare against. */
  projectedProfit: number | null;
  projectedMarginPct: number | null;
}

export function costPlanSummary(
  quotes: Quote[],
  changeOrders: ChangeOrder[],
  materialCost: number | null,
  laborPlannedCost: number,
  costPlanItems: CostPlanItem[],
): CostPlanSummary {
  const contractValue = projectContractValue(quotes, changeOrders);
  const subcontractorCost = costPlanGroupTotal(costPlanItems, "subcontractor");
  const equipmentCost = costPlanGroupTotal(costPlanItems, "equipment");
  const otherCost = costPlanGroupTotal(costPlanItems, "other");
  const totalPlannedCost = (materialCost ?? 0) + laborPlannedCost + subcontractorCost + equipmentCost + otherCost;
  const projectedProfit = contractValue > 0 ? contractValue - totalPlannedCost : null;
  const projectedMarginPct = projectedProfit !== null && contractValue > 0 ? (projectedProfit / contractValue) * 100 : null;

  return {
    contractValue,
    materialCost,
    laborCost: laborPlannedCost,
    subcontractorCost,
    equipmentCost,
    otherCost,
    totalPlannedCost,
    projectedProfit,
    projectedMarginPct,
  };
}

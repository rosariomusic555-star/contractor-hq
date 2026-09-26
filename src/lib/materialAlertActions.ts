import { MATERIAL_ORDER_UNITS, createMaterialOrder, type MaterialOrderUnit, type MaterialsItem } from "./api";
import { effectiveEstimate, unitsMatch } from "./materialTracking";
import { materialLineLabel } from "./materialsMath";

/**
 * The order line "Mark as ordered" logs for a sheet line: its estimate in
 * the line's own unit when that's an order unit; else in its conversion unit
 * (rounded up to whole pallets / bags…); else "each", with the line's own
 * quantity and unit kept in the description. Any matched order line marks
 * the sheet line ordered (hasAnyOrder), whatever the unit.
 */
export function orderLineFor(line: MaterialsItem): { description: string; quantity: number; unit: MaterialOrderUnit; materials_item_id: string } {
  const est = effectiveEstimate(line).quantity;
  const direct = MATERIAL_ORDER_UNITS.find((u) => unitsMatch(u.value, line.unit));
  if (direct) return { description: materialLineLabel(line), quantity: est, unit: direct.value, materials_item_id: line.id };
  const conv = line.conversion_unit && line.conversion_factor ? MATERIAL_ORDER_UNITS.find((u) => unitsMatch(u.value, line.conversion_unit)) : null;
  if (conv) {
    return { description: materialLineLabel(line), quantity: Math.ceil(est / Number(line.conversion_factor)), unit: conv.value, materials_item_id: line.id };
  }
  const own = `${Math.round(est * 100) / 100}${line.unit ? ` ${line.unit}` : ""}`;
  return { description: `${materialLineLabel(line)} — ${own}`, quantity: Math.max(1, Math.round(est)), unit: "each", materials_item_id: line.id };
}

/** One order (status "ordered") covering these lines. */
export function markLinesOrdered(projectId: string, lines: MaterialsItem[]) {
  return createMaterialOrder({
    project_id: projectId,
    status: "ordered",
    notes: "Marked ordered from material alerts",
    items: lines.map(orderLineFor),
  });
}

/**
 * Materials sheet line math + unit vocabulary — the one place a line's
 * waste-adjusted quantity and total are computed, so the sheet, its
 * section/sheet totals, materialsCogs() (Cost Plan, quote Estimated Cost,
 * margins), the Material Tracker and the Order Sheet can never disagree.
 * (supabase/functions/assistant-chat/format.ts keeps its own copy of the
 * cost formula — Deno can't import this file — keep the two in step.)
 */

/** Required quantity with waste = quantity × (1 + waste%). An empty/blank
 * waste counts as 0. */
export function quantityWithWaste(quantity: number | string | null | undefined, wastePercent: number | string | null | undefined): number {
  // Rounded to 6 places: 180 at 10% is 198, not 198.00000000000003.
  return Math.round((Number(quantity) || 0) * (1 + (Number(wastePercent) || 0) / 100) * 1e6) / 1e6;
}

/** A line's cost: waste-adjusted quantity × unit cost. */
export function materialsLineTotal(item: {
  quantity: number | string;
  unit_cost: number | string;
  waste_percent?: number | string | null;
}): number {
  return quantityWithWaste(item.quantity, item.waste_percent) * (Number(item.unit_cost) || 0);
}

/** The waste % (2 decimals) that makes `quantity` + waste land on
 * `target` — how "Use {next orderable quantity}" accepts the suggestion
 * without touching the measured quantity itself (the overage beyond the
 * required amount is recorded as extra waste). Never negative. */
export function wastePercentToReach(quantity: number, target: number): number {
  if (!quantity || quantity <= 0) return 0;
  return Math.max(0, Math.round((target / quantity - 1) * 10000) / 100);
}

/** Tidy number for display — up to 2 decimals, no trailing zeros. */
export const formatQty = (n: number) => String(Math.round(n * 100) / 100);

/** A line's display name everywhere it's shown — includes its color when
 * one's set ("Blu 60 Slate — Onyx Black"). */
export function materialLineLabel(item: { name: string; color?: string | null }): string {
  const color = item.color?.trim();
  return color ? `${item.name} — ${color}` : item.name;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** The Unit dropdown's fixed options. Anything else is kept as a custom unit. */
export const MATERIAL_UNITS = ["sq ft", "ft", "cu yd", "piece", "layer", "pallet", "ton", "bag", "roll", "tube"] as const;

/** Spellings that mean one of MATERIAL_UNITS (lower-cased, trimmed). Same
 * mapping migration 0093 applied to existing lines. */
const UNIT_SYNONYMS: Record<string, (typeof MATERIAL_UNITS)[number]> = {
  "sq ft": "sq ft",
  sqft: "sq ft",
  "sq. ft.": "sq ft",
  "sq.ft.": "sq ft",
  "sq.ft": "sq ft",
  sf: "sq ft",
  "square foot": "sq ft",
  "square feet": "sq ft",
  ft2: "sq ft",
  // Linear feet — calculator lines (edge restraint, rebar, countertop) are "ft".
  ft: "ft",
  feet: "ft",
  foot: "ft",
  lf: "ft",
  "lin ft": "ft",
  "lin. ft.": "ft",
  "linear ft": "ft",
  "linear feet": "ft",
  "cu yd": "cu yd",
  "cu. yd.": "cu yd",
  cy: "cu yd",
  yd3: "cu yd",
  "cubic yard": "cu yd",
  "cubic yards": "cu yd",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  ea: "piece",
  each: "piece",
  layer: "layer",
  layers: "layer",
  pallet: "pallet",
  pallets: "pallet",
  ton: "ton",
  tons: "ton",
  tn: "ton",
  bag: "bag",
  bags: "bag",
  roll: "roll",
  rolls: "roll",
  tube: "tube",
  tubes: "tube",
};

/** Maps a unit onto its dropdown option when it's a known spelling;
 * otherwise returns it unchanged (a custom unit). Never loses a value. */
export function normalizeMaterialUnit(unit: string | null | undefined): string {
  const raw = (unit ?? "").trim();
  return UNIT_SYNONYMS[raw.toLowerCase()] ?? raw;
}

export function isStandardMaterialUnit(unit: string | null | undefined): boolean {
  return (MATERIAL_UNITS as readonly string[]).includes(unit ?? "");
}

// ---------------------------------------------------------------------------
// Section item sort
// ---------------------------------------------------------------------------

/** A section's display order — "manual" is the saved drag/arrow order;
 * the cost sorts are view-only and never rewrite it on their own. */
export type ItemSortMode = "manual" | "cost_desc" | "cost_asc";

/** Items in display order for a sort mode. Stable (ties keep manual order);
 * returns the same array for "manual". */
export function sortItemsByCost<T extends { quantity: number; unit_cost: number; waste_percent?: number | null }>(
  items: T[],
  mode: ItemSortMode,
): T[] {
  if (mode === "manual") return items;
  const dir = mode === "cost_desc" ? -1 : 1;
  return items
    .map((item, index) => ({ item, index, total: materialsLineTotal(item) }))
    .sort((a, b) => (a.total - b.total) * dir || a.index - b.index)
    .map((r) => r.item);
}

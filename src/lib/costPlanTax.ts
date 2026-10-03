import { taxableByDefault, type LineCostType, type TaxRateSource } from "./costPlanMath";

/**
 * Which sales tax rate a Cost plan line gets (0163) — the builder's live copy
 * of the DB trigger materials_items_tax(), so the draft shows (and totals)
 * exactly what Save will store:
 *  - a typed (custom) rate wins;
 *  - a saved line whose vendor hasn't changed keeps the rate it has (a
 *    completed job keeps the rate it was costed at);
 *  - otherwise the line's supplier's rate (Settings › Suppliers), else the
 *    default (Settings › Cost plan tax).
 * Taxable defaults to on for Material + Equipment, off for the rest, and off
 * for every line in a plan whose tax was turned off.
 */

export interface TaxContext {
  defaultRate: number;
  suppliers: { name: string; tax_rate?: number | null }[];
  /** "Turn off tax for this plan" (materials_sheets.tax_off). */
  taxOff: boolean;
}

export interface LineTaxView {
  taxable: boolean;
  rate: number;
  source: TaxRateSource;
}

const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** A non-custom line's rate: its supplier's, else the default. */
export function resolveTaxRate(vendor: string | null | undefined, ctx: Pick<TaxContext, "defaultRate" | "suppliers">): { rate: number; source: TaxRateSource } {
  const k = key(vendor);
  const supplier = k ? ctx.suppliers.find((s) => s.tax_rate != null && key(s.name) === k) : undefined;
  if (supplier) return { rate: Number(supplier.tax_rate), source: "supplier" };
  return { rate: Number(ctx.defaultRate) || 0, source: "default" };
}

export function lineTaxView(
  item: { cost_type: LineCostType; vendor: string; taxable?: boolean; tax_custom_rate?: number | null },
  saved: { vendor?: string | null; tax_rate?: number | null; tax_rate_source?: TaxRateSource | null } | undefined,
  ctx: TaxContext,
): LineTaxView {
  const taxable = item.taxable ?? (!ctx.taxOff && taxableByDefault(item.cost_type));
  if (item.tax_custom_rate != null) return { taxable, rate: item.tax_custom_rate, source: "custom" };
  if (saved && saved.tax_rate_source !== "custom" && key(saved.vendor) === key(item.vendor)) {
    return { taxable, rate: Number(saved.tax_rate ?? 0), source: saved.tax_rate_source ?? "default" };
  }
  return { taxable, ...resolveTaxRate(item.vendor, ctx) };
}

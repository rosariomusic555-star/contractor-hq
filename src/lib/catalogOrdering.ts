import type { ProductCatalogItem } from "./api";

/**
 * Shared "orderable quantity" math for Catalog-linked materials sheet
 * lines — used both by the item-row picker's inline nudge
 * (ProjectMaterialsView) and Smart Section's calculator, so the two can
 * never drift into two different rounding rules.
 */

/** package_coverage = coverage_per_unit × units_per_package — how much a
 * whole package (pallet, bag, box…) of this product covers, in the
 * product's own unit. Null when the product doesn't carry both specs. */
function packageCoverage(specs: ProductCatalogItem["specs"] | undefined): number | null {
  const coverage = Number(specs?.coverage_per_unit);
  const perPackage = Number(specs?.units_per_package);
  if (!coverage || !perPackage) return null;
  return coverage * perPackage;
}

/** Rounds a required quantity up to the nearest whole multiple of the
 * product's package coverage. Falls back to a plain ceil when the product
 * carries no package specs (nothing to round by) — used by the Smart
 * Section calculator, which always wants a final number. */
export function roundUpToOrderable(
  quantity: number,
  specs: ProductCatalogItem["specs"] | undefined,
): number {
  const coverage = packageCoverage(specs);
  if (!coverage || quantity <= 0) return Math.ceil(quantity);
  return Math.ceil(quantity / coverage) * coverage;
}

/** For the picker's inline nudge: returns the next orderable quantity only
 * when the entered quantity isn't already a clean multiple of a whole
 * package (nothing to nudge otherwise), or null when the product carries
 * no package specs. */
export function nextOrderableQuantity(
  quantity: number,
  specs: ProductCatalogItem["specs"] | undefined,
): number | null {
  const coverage = packageCoverage(specs);
  if (!coverage || quantity <= 0) return null;
  const packages = quantity / coverage;
  // Tolerance, not exact equality: a quantity that's been matched to a
  // whole package via a 2-decimal waste % (see wastePercentToReach) lands
  // a hair off the exact multiple and must not re-trigger the nudge.
  if (Math.abs(packages - Math.round(packages)) < 1e-3) return null;
  // Rounded so float noise (116.82 × 3 = 350.46000000000004) never shows.
  return Math.round(Math.ceil(packages) * coverage * 100) / 100;
}

/** The Order Sheet's "how much to actually order" quantity (0090) —
 * `waste_percent` applied first (a real material line's own reference-only
 * field, never applied anywhere else in the app — see MaterialsItem's doc
 * comment), then rounded up to a whole package the same way
 * roundUpToOrderable() already does everywhere else. Same "always returns a
 * real number" contract as roundUpToOrderable — falls back to a plain
 * waste-adjusted ceil when there's no package data to round by. */
export function wasteAdjustedOrderQuantity(
  quantity: number,
  wastePercent: number,
  specs: ProductCatalogItem["specs"] | undefined,
): number {
  const withWaste = quantity * (1 + (wastePercent || 0) / 100);
  return roundUpToOrderable(withWaste, specs);
}

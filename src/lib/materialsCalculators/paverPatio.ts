import type { PriceBookItem } from "@/lib/api";
import type { BuildTypeDefinition, GeneratedMaterialItem } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Order-quantity rounding for tons — up to the nearest half. */
const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

/**
 * A plain formula-driven line: the selected product (if any) supplies the
 * name/cost/category and gets linked (price_book_item_id set) exactly like
 * a manually-picked Price Book item — locking its category the same way.
 * No product selected = a clearly-flagged estimate at $0, left for the
 * contractor to price manually.
 *
 * Cost caveat: unit_cost is the selected product's unit_price taken as-is
 * against this quantity/unit. That's only correct if the product happens
 * to be priced per this same unit (e.g. "per ton") — Price Book items can
 * be priced in whatever unit the contractor typed into their own Unit
 * field, which this calculator has no way to verify. Reviewing the
 * generated row before trusting it is expected, same as any other line
 * here — nothing is locked.
 */
function productOrEstimateLine(
  product: PriceBookItem | null,
  fallbackName: string,
  quantity: number,
  unit: string,
): GeneratedMaterialItem {
  if (product) {
    return {
      name: product.name,
      quantity,
      unit,
      unit_cost: Number(product.unit_price),
      expense_category_id: product.expense_category_id,
      price_book_item_id: product.id,
    };
  }
  return {
    name: `${fallbackName} (estimate — no product selected)`,
    quantity,
    unit,
    unit_cost: 0,
    expense_category_id: null,
    price_book_item_id: null,
  };
}

/**
 * Paver Patio — the first Smart Calculator build type.
 *
 * Formulas and constants below are as specified by the user, not derived
 * or guessed — see the inline comments for the reasoning behind each one.
 */
export const paverPatioBuildType: BuildTypeDefinition = {
  id: "paver_patio",
  label: "Paver Patio",
  description: "Pavers, base, bedding sand, and joint sand for a paver patio.",
  materialSlots: [
    { key: "paver", label: "Paver", materialType: "paver", required: true },
    { key: "base_aggregate", label: "Base aggregate", materialType: "base_aggregate" },
    { key: "bedding_sand", label: "Bedding sand", materialType: "bedding_sand" },
    { key: "polymeric_sand", label: "Polymeric (joint) sand", materialType: "polymeric_sand" },
    { key: "edge_restraint", label: "Edge restraint", materialType: "edge_restraint" },
  ],
  dimensionFields: [
    { key: "length_ft", label: "Patio length", unit: "ft", step: "0.5", placeholder: "e.g. 30" },
    { key: "width_ft", label: "Patio width", unit: "ft", step: "0.5", placeholder: "e.g. 30" },
    {
      key: "base_depth_in",
      label: "Base depth (compacted aggregate)",
      unit: "in",
      step: "0.5",
      placeholder: "e.g. 6",
    },
    {
      key: "waste_factor_pct",
      label: "Waste factor",
      unit: "%",
      step: "1",
      defaultFrom: "waste_factor_pct",
    },
    {
      key: "bedding_sand_depth_in",
      label: "Bedding sand depth",
      unit: "in",
      step: "0.25",
      defaultFrom: "bedding_sand_depth_in",
    },
    {
      key: "bedding_sand_coverage_sqft_per_ton",
      label: "Bedding sand coverage",
      unit: "sq ft/ton @1in",
      step: "5",
      defaultFrom: "bedding_sand_coverage_sqft_per_ton",
    },
    {
      key: "polymeric_sand_coverage_sqft_per_bag",
      label: "Polymeric sand coverage",
      unit: "sq ft/bag",
      step: "1",
      defaultFrom: "polymeric_sand_coverage_sqft_per_bag",
    },
  ],
  summarizeDimensions: (d) => {
    const length = d.length_ft || 0;
    const width = d.width_ft || 0;
    if (!length || !width) return null;
    const area = length * width;
    const perimeter = 2 * (length + width);
    return `= ${area.toLocaleString()} sq ft · perimeter ${perimeter.toLocaleString()} ft`;
  },
  calculate: (inputs) => {
    const d = inputs.dimensions;
    const lengthFt = d.length_ft || 0;
    const widthFt = d.width_ft || 0;
    const areaSqft = lengthFt * widthFt;
    const perimeterFt = 2 * (lengthFt + widthFt);
    const wasteFactorPct = d.waste_factor_pct || 0;
    const baseDepthIn = d.base_depth_in || 0;
    const beddingDepthIn = d.bedding_sand_depth_in || 0;
    const beddingCoverageSqftPerTon = d.bedding_sand_coverage_sqft_per_ton || 200;
    const polymericCoverageDefault = d.polymeric_sand_coverage_sqft_per_bag || 80;

    const items: GeneratedMaterialItem[] = [];

    // 1. Pavers — coverage math uses the selected product's real
    // coverage-per-pallet spec when available, rounded up to a whole
    // pallet. Without a product (or a product missing that spec), falls
    // back to a plain sq-ft estimate the contractor prices manually.
    const paver = inputs.selections.paver;
    const requiredCoverageSqft = areaSqft * (1 + wasteFactorPct / 100);
    if (paver?.specs.coverage_per_pallet_sqft) {
      const pallets = Math.ceil(requiredCoverageSqft / paver.specs.coverage_per_pallet_sqft);
      items.push({
        name: paver.name,
        quantity: pallets,
        unit: "pallet",
        unit_cost: round2(paver.specs.coverage_per_pallet_sqft * Number(paver.unit_price)),
        expense_category_id: paver.expense_category_id,
        price_book_item_id: paver.id,
      });
    } else if (paver) {
      items.push({
        name: paver.name,
        quantity: Math.round(requiredCoverageSqft),
        unit: "sq ft",
        unit_cost: Number(paver.unit_price),
        expense_category_id: paver.expense_category_id,
        price_book_item_id: paver.id,
      });
    } else {
      items.push({
        name: "Pavers (estimate — no product selected)",
        quantity: Math.round(requiredCoverageSqft),
        unit: "sq ft",
        unit_cost: 0,
        expense_category_id: null,
        price_book_item_id: null,
      });
    }

    // 2. Base aggregate — tons = area * depth / 165 (1 ton covers 33 sq ft
    // at 5" depth: 33 * 5 = 165). No separate waste factor on top — the
    // ordering constant already accounts for it. Base depth is never
    // pre-filled; it varies job to job.
    const baseTons = roundUpToHalfTon((areaSqft * baseDepthIn) / 165);
    items.push(productOrEstimateLine(inputs.selections.base_aggregate, "Base aggregate", baseTons, "ton"));

    // 3. Bedding sand — same area*depth/coverage logic as base aggregate,
    // calibrated at the editable bedding depth/coverage defaults (which
    // default to a 1" reference depth) instead of a fixed constant.
    const beddingTons = roundUpToHalfTon((areaSqft * beddingDepthIn) / beddingCoverageSqftPerTon);
    items.push(productOrEstimateLine(inputs.selections.bedding_sand, "Bedding sand", beddingTons, "ton"));

    // 4. Polymeric sand — a selected product's own coverage-per-bag spec
    // wins over the generic (editable) default when present. No waste
    // factor on this one.
    const polySand = inputs.selections.polymeric_sand;
    const polyCoverage = polySand?.specs.coverage_per_bag_sqft || polymericCoverageDefault;
    const bags = Math.ceil(areaSqft / polyCoverage);
    items.push(productOrEstimateLine(polySand, "Polymeric sand", bags, "bag"));

    // 5. Edge restraint — perimeter-based, same waste factor as pavers.
    // Ordered in plain linear feet rather than sticks — stick length isn't
    // a spec this app tracks per product, and linear feet is simpler.
    const edgeFeet = Math.ceil(perimeterFt * (1 + wasteFactorPct / 100));
    items.push(productOrEstimateLine(inputs.selections.edge_restraint, "Edge restraint", edgeFeet, "ft"));

    return items;
  },
};

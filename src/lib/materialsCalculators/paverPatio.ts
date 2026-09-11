import type { BuildTypeDefinition, GeneratedMaterialItem } from "./types";

/**
 * Paver Patio — the first Smart Calculator build type.
 *
 * Scaffolding only: calculate() is a stub. The real hardscape formulas
 * (waste factor application, coverage-per-pallet math using a picked Price
 * Book product's specs vs. a generic fallback estimate when none is
 * picked) are coming separately — deliberately not guessed at here, since
 * getting them wrong directly affects material cost accuracy.
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
    { key: "area_sqft", label: "Patio area", unit: "sq ft", step: "1", placeholder: "e.g. 900" },
    {
      key: "base_depth_in",
      label: "Base depth",
      unit: "in",
      step: "0.5",
      defaultFrom: "base_depth_default_in",
    },
    {
      key: "waste_factor_pct",
      label: "Waste factor",
      unit: "%",
      step: "1",
      defaultFrom: "waste_factor_pct",
    },
  ],
  calculate: (inputs) => {
    // TODO(paver-patio-formulas): replace with the real calculation once
    // provided — coverage/order-quantity math per material slot, using
    // the selected Price Book product's specs when present, a generic
    // per-material estimate (clearly flagged in the item name) when not.
    const placeholder: GeneratedMaterialItem = {
      name: "Paver Patio calculator — formulas not yet configured",
      quantity: 0,
      unit: "",
      unit_cost: 0,
      expense_category_id: null,
      price_book_item_id: null,
    };
    return [placeholder];
  },
};

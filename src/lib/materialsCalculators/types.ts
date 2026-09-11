import type { PriceBookItem } from "@/lib/api";

/** One field in a build type's dimension-input form. */
export interface DimensionField {
  key: string;
  label: string;
  /** Display suffix, e.g. "sq ft", "in", "%". */
  unit: string;
  step?: string;
  placeholder?: string;
  /** Pre-fills this field from the user's saved Material Defaults — still a
   * plain, per-job-editable dimension field, just seeded from there. */
  defaultFrom?:
    | "waste_factor_pct"
    | "bedding_sand_depth_in"
    | "bedding_sand_coverage_sqft_per_ton"
    | "polymeric_sand_coverage_sqft_per_bag";
}

/** One material a build type needs a Price Book product for (or not —
 * every slot can be left unset in favor of a generic estimate). */
export interface MaterialSlot {
  key: string;
  label: string;
  /** Filters the Price Book picker to items with this material_type. */
  materialType: string;
  required?: boolean;
}

/** What calculate() returns for one generated line — the same shape as a
 * Materials Sheet draft item, minus the id (ProjectMaterialsView assigns
 * a tmp id when appending it to the draft). */
export interface GeneratedMaterialItem {
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  expense_category_id: string | null;
  price_book_item_id: string | null;
}

export interface CalculatorInputs {
  /** Keyed by DimensionField.key, parsed to numbers. */
  dimensions: Record<string, number>;
  /** Keyed by MaterialSlot.key; null = "no specific product — generic estimate". */
  selections: Record<string, PriceBookItem | null>;
}

export interface BuildTypeDefinition {
  id: string;
  label: string;
  description: string;
  materialSlots: MaterialSlot[];
  dimensionFields: DimensionField[];
  /** Optional live readout of derived values (e.g. computed area/perimeter
   * from length x width) shown under the dimension form as the contractor
   * types, so they can sanity-check numbers before generating. Called with
   * whatever's currently parseable in the form, including partial/zeroed
   * values. */
  summarizeDimensions?: (dimensions: Record<string, number>) => string | null;
  calculate: (inputs: CalculatorInputs) => GeneratedMaterialItem[];
}

import type { PriceBookItem } from "@/lib/api";

/** One field in a build type's dimension-input form. */
export interface DimensionField {
  key: string;
  label: string;
  /** Display suffix, e.g. "sq ft", "in", "%". */
  unit: string;
  step?: string;
  placeholder?: string;
  /** Pre-fills this field from the user's saved Material Defaults, when set. */
  defaultFrom?: "waste_factor_pct" | "base_depth_default_in";
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
  calculate: (inputs: CalculatorInputs) => GeneratedMaterialItem[];
}

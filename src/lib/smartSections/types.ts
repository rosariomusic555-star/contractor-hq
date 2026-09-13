import type { ProductCatalogItem } from "@/lib/api";

export type SmartSectionQuestionType = "area_or_dimensions" | "number" | "toggle" | "select" | "catalog_product";

interface BaseQuestion {
  key: string;
  label: string;
}

/** Toggle between "I know the square footage" and "I know length x width"
 * — either path produces { areaSqft, perimeterFt }. perimeterFt is a
 * flagged estimate (assumes a square footprint) when only sq ft was
 * entered, since an exact perimeter needs real dimensions. */
export interface AreaOrDimensionsQuestion extends BaseQuestion {
  type: "area_or_dimensions";
}

export interface NumberQuestion extends BaseQuestion {
  type: "number";
  unit: string;
  defaultValue?: number;
  step?: string;
}

export interface ToggleQuestion extends BaseQuestion {
  type: "toggle";
  defaultValue?: boolean;
}

export interface SelectQuestion extends BaseQuestion {
  type: "select";
  options: { value: string; label: string }[];
  defaultValue?: string;
}

export interface CatalogProductQuestion extends BaseQuestion {
  type: "catalog_product";
  /** Restrict the picker to this Catalog category (e.g. "Wall Block"). */
  category?: string;
  /** Only rendered (and only required) when another question's answer
   * matches — e.g. the border paver product only shows when "include
   * border" is on. */
  showWhen?: { key: string; equals: boolean | string };
}

export type SmartSectionQuestion =
  | AreaOrDimensionsQuestion
  | NumberQuestion
  | ToggleQuestion
  | SelectQuestion
  | CatalogProductQuestion;

export interface AreaAndPerimeter {
  areaSqft: number;
  perimeterFt: number;
}

/** Answers keyed by question.key. Each calculate() function knows its own
 * template's question shapes and casts accordingly — same loose-typing
 * convention as the rest of this app. */
export type SmartSectionAnswers = Record<string, unknown>;

/**
 * One computed line item. `name` MUST exactly match one of the build
 * type's `lineItems` (step 1) — the caller matches purely by that string,
 * so a template's calculate() and its lineItems array must stay in sync
 * (they live in the same file for exactly this reason).
 */
export interface CalculatedLine {
  name: string;
  quantity: number;
  unit: string;
  /** Set when this line is tied to a picked catalog product — the caller
   * links catalog_product_id and seeds unit_cost from a remembered price
   * on first run only, never overwriting a price the contractor already
   * typed in. */
  catalogProduct?: ProductCatalogItem | null;
}

export interface SmartSectionTemplate {
  id: string;
  label: string;
  /** Step 1 — the fixed line-item name template, auto-populated with no
   * math when the build type is picked. */
  lineItems: string[];
  /** Step 2 — the calculator's question set, run on demand from the
   * section's calculator icon. */
  questions: SmartSectionQuestion[];
  /** Step 2 — turns answers into quantities for (a subset of) lineItems.
   * A line omitted from the result is left untouched by the caller (e.g.
   * an optional line the user didn't ask for this run). */
  calculate: (answers: SmartSectionAnswers) => CalculatedLine[];
}

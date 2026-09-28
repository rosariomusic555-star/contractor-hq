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

/** Answers keyed by question.key (for real questions) or by a tunable's
 * key (for pure formula constants with no on-screen question — seeded by
 * the calculator dialog from the contractor's stored settings before
 * calculate() runs). Each calculate() function knows its own template's
 * shapes and casts accordingly — same loose-typing convention as the rest
 * of this app. */
export type SmartSectionAnswers = Record<string, unknown>;

/**
 * A stable, code-level identity for one material a build type generates —
 * never shown to the user, never renamed. `defaultName` is the app's
 * shipped line-item name (step 1) and the label calculate() is written
 * against; a contractor's customized display name is resolved separately
 * (see resolveEffectiveLineItems in ./index.ts) so renames don't require
 * touching calculate().
 */
export interface LineItemSlot {
  key: string;
  defaultName: string;
  /** An optional add-on that only exists when it's measured (kitchen
   * backsplash, seating wall backrest caps, strip lighting). Added after
   * most sections — and contractors' customized line-item lists — already
   * existed, so the calculator adds the line when it's missing instead of
   * dropping it. */
  addOn?: boolean;
}

/** One tunable number a build type's formulas use — a coverage rate, a
 * dimension assumption, a default depth/spacing. Editable per contractor
 * (Settings > Manage Smart Section Templates), grouped in that editor
 * under `relatedSlotKey`'s line item. Never a formula/expression — always
 * a plain number substituted into formulas already written in code. */
export interface TunableDefault {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
  relatedSlotKey: string;
}

/**
 * What calculate() actually returns — keyed by slotKey (never a display
 * name), so a contractor renaming a line item never breaks the formula
 * that computes it. The caller (SmartSectionCalculatorDialog) resolves
 * slotKey -> the contractor's current display name for that slot before
 * matching it into the section.
 */
export interface RawCalculatedLine {
  slotKey: string;
  /** The measured need, WITHOUT waste — waste goes on the line's own Waste %
   * (`wastePercent`), which the line cost and the Order Sheet apply. Baking
   * it in here too counted it twice. */
  quantity: number;
  unit: string;
  catalogProduct?: ProductCatalogItem | null;
  /** Sets the line's Waste % (e.g. the template's waste tunable). */
  wastePercent?: number;
}

/** Resolved for matching into a section's actual line items — `name`
 * must exactly match an existing item's name for the caller to apply it;
 * a line whose resolved name isn't found is left untouched. */
export interface CalculatedLine {
  name: string;
  quantity: number;
  unit: string;
  catalogProduct?: ProductCatalogItem | null;
  /** Add the line to the section when no line of this name exists yet (add-on slots). */
  addIfMissing?: boolean;
  /** Sets the line's Waste % when given. */
  wastePercent?: number;
}

export interface SmartSectionTemplate {
  id: string;
  label: string;
  /** Step 1 — the fixed line-item template, auto-populated with no math
   * when the build type is picked. A contractor's customized line items
   * (add/remove/rename/reorder) override this per their own account —
   * see resolveEffectiveLineItems. */
  lineItemSlots: LineItemSlot[];
  /** Step 2 — the calculator's question set, run on demand from the
   * section's calculator icon. */
  questions: SmartSectionQuestion[];
  /** Step 2 — the tunable numbers calculate()'s formulas use, editable
   * per contractor. Includes both pure formula constants (no on-screen
   * question) and the seed/default value for number questions. */
  tunables: TunableDefault[];
  /** Step 2 — turns answers into quantities for (a subset of)
   * lineItemSlots, keyed by slotKey. A slot omitted from the result is
   * left untouched by the caller (e.g. an optional line not applicable
   * this run). */
  calculate: (answers: SmartSectionAnswers) => RawCalculatedLine[];
}

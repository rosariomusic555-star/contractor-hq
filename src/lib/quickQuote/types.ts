import type { ProductCatalogItem } from "@/lib/api";

export type QuickQuoteQuestionType = "area" | "number" | "catalog_product";

interface BaseQuestion {
  key: string;
  label: string;
}

/** Toggle between "I know the square footage" and "I know length x width"
 * — either path produces a plain area in sq ft under this question's key.
 * Unlike Smart Section's version, no perimeter is needed here — Quick
 * Quote only ever prices by a single quantity (sq ft, linear ft, or fixture
 * count), never a materials breakdown. */
export interface AreaQuestion extends BaseQuestion {
  type: "area";
}

export interface NumberQuestion extends BaseQuestion {
  type: "number";
  unit: string;
}

export interface CatalogProductQuestion extends BaseQuestion {
  type: "catalog_product";
  category?: string;
}

export type QuickQuoteQuestion = AreaQuestion | NumberQuestion | CatalogProductQuestion;

/** Answers keyed by question.key — area questions store a plain number,
 * number questions a plain number, catalog_product questions a
 * ProductCatalogItem | null. */
export type QuickQuoteAnswers = Record<string, unknown>;

export interface QuickQuoteTemplate {
  id: string;
  label: string;
  /** Shown next to the rate field, e.g. "$ / sq ft". */
  pricingUnit: string;
  /** Free-text unit label written onto the created line item (sf, lf, ea). */
  lineItemUnit: string;
  /** App-shipped starting rate — a contractor's own Quick Quote Rates
   * setting overrides this per build type. */
  defaultRate: number;
  questions: QuickQuoteQuestion[];
  /** Pulls the pricing quantity out of the answers. */
  quantity: (answers: QuickQuoteAnswers) => number;
  /** Offline fallback description if the AI call fails or times out — kept
   * short and factual, same tone the AI is asked for. */
  fallbackDescription: (answers: QuickQuoteAnswers) => string;
}

/** Shared helper: pulls a picked catalog product's name/brand out of an
 * answer, or null if none was picked — used by both the AI prompt input
 * and every template's fallbackDescription. */
export function pickedProduct(answers: QuickQuoteAnswers, key: string): ProductCatalogItem | null {
  return (answers[key] as ProductCatalogItem | null) ?? null;
}

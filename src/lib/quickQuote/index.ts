import type { QuickQuoteRate } from "@/lib/api";
import { paverPatioQuickQuote } from "./paverPatio";
import { outdoorKitchenQuickQuote } from "./outdoorKitchen";
import { seatingWallQuickQuote } from "./seatingWall";
import { firePitQuickQuote } from "./firePit";
import { outdoorLightingQuickQuote } from "./outdoorLighting";
import { irrigationQuickQuote, pergolaQuickQuote, plantsQuickQuote, sodQuickQuote, waterFeatureQuickQuote } from "./landscape";
import type { QuickQuoteTemplate } from "./types";

/** Registry of Quick Quote build types. Adding a 6th means writing one new
 * module like paverPatio.ts and adding it here. */
export const QUICK_QUOTE_TEMPLATES: QuickQuoteTemplate[] = [
  paverPatioQuickQuote,
  outdoorKitchenQuickQuote,
  seatingWallQuickQuote,
  firePitQuickQuote,
  outdoorLightingQuickQuote,
  pergolaQuickQuote,
  waterFeatureQuickQuote,
  sodQuickQuote,
  irrigationQuickQuote,
  plantsQuickQuote,
];

export const findQuickQuoteTemplate = (id: string): QuickQuoteTemplate | null =>
  QUICK_QUOTE_TEMPLATES.find((t) => t.id === id) ?? null;

/** This contractor's effective rate for a build type: their stored
 * override if present, else the template's shipped default. */
export const resolveQuickQuoteRate = (template: QuickQuoteTemplate, rates: QuickQuoteRate[]): number => {
  const override = rates.find((r) => r.build_type === template.id);
  return override ? override.rate : template.defaultRate;
};

export * from "./types";

import type { QuickQuoteTemplate } from "./types";

/** An outdoor fireplace is priced per unit — sizes vary less than their
 * finish does. Default rate is an ASSUMPTION (Settings › Quick Quote Rates). */
export const fireplaceQuickQuote: QuickQuoteTemplate = {
  id: "fireplace",
  label: "Fireplace",
  pricingUnit: "$ / fireplace",
  lineItemUnit: "ea",
  defaultRate: 12000, // ASSUMPTION — varies widely with veneer and size
  questions: [{ key: "fireplace_count", label: "Number of fireplaces", type: "number", unit: "ea" }],
  quantity: (a) => Number(a.fireplace_count) || 0,
  fallbackDescription: (a) => {
    const n = Number(a.fireplace_count) || 1;
    return `Build ${n === 1 ? "an outdoor masonry fireplace" : `${n} outdoor masonry fireplaces`} on a concrete footing, with firebox, chimney flue, stone veneer and chimney cap.`;
  },
};

import type { QuickQuoteTemplate } from "./types";

export const outdoorLightingQuickQuote: QuickQuoteTemplate = {
  id: "outdoor_lighting",
  label: "Outdoor Lighting",
  pricingUnit: "$ / fixture",
  lineItemUnit: "ea",
  defaultRate: 150, // ASSUMPTION — real market rate varies widely by region
  questions: [
    { key: "fixture_count", label: "Number of fixtures", type: "number", unit: "ea" },
    // Context for the AI description only — not part of the price.
    { key: "wire_run_ft", label: "Approximate wire run", type: "number", unit: "ft" },
  ],
  quantity: (answers) => Number(answers.fixture_count) || 0,
  fallbackDescription: (answers) => {
    const fixtureCount = Number(answers.fixture_count) || 0;
    const wireRunFt = Number(answers.wire_run_ft) || 0;
    const wirePhrase = wireRunFt > 0 ? ` with approximately ${wireRunFt.toLocaleString()} ft of low-voltage wire` : "";
    return `Installation of ${fixtureCount.toLocaleString()} outdoor light fixture${fixtureCount === 1 ? "" : "s"}${wirePhrase}.`;
  },
};

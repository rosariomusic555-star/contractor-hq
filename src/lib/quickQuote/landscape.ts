import type { QuickQuoteTemplate } from "./types";

/** Pergola, Water Feature, Sod, Irrigation, Plants — default rates are
 * ASSUMPTIONS (editable in Settings › Quick Quote Rates). */

const sq = (a: Record<string, unknown>) => Number(a.area_sqft) || 0;

export const pergolaQuickQuote: QuickQuoteTemplate = {
  id: "pergola",
  label: "Pergola",
  pricingUnit: "$ / sq ft",
  lineItemUnit: "sf",
  defaultRate: 55,
  questions: [{ key: "area_sqft", label: "Pergola footprint", type: "area" }],
  quantity: sq,
  fallbackDescription: (a) => `Build and install a ${sq(a).toLocaleString()} sq ft pergola, including posts set in concrete footings, beams, rafters and top slats.`,
};

export const waterFeatureQuickQuote: QuickQuoteTemplate = {
  id: "water_feature",
  label: "Water Feature",
  pricingUnit: "$ / sq ft",
  lineItemUnit: "sf",
  defaultRate: 75,
  questions: [{ key: "area_sqft", label: "Water feature footprint", type: "area" }],
  quantity: sq,
  fallbackDescription: (a) => `Build a ${sq(a).toLocaleString()} sq ft water feature, including excavation, liner, pump, plumbing and natural stone.`,
};

export const sodQuickQuote: QuickQuoteTemplate = {
  id: "sod",
  label: "Sod",
  pricingUnit: "$ / sq ft",
  lineItemUnit: "sf",
  defaultRate: 1.75,
  questions: [{ key: "area_sqft", label: "Lawn area", type: "area" }],
  quantity: sq,
  fallbackDescription: (a) => `Install ${sq(a).toLocaleString()} sq ft of fresh sod, including grading, topsoil and starter fertilizer.`,
};

export const irrigationQuickQuote: QuickQuoteTemplate = {
  id: "irrigation",
  label: "Irrigation",
  // Priced per zone, the way the irrigation measurement card counts it.
  pricingUnit: "$ / zone",
  lineItemUnit: "zone",
  defaultRate: 900,
  questions: [{ key: "zone_count", label: "Number of zones", type: "number", unit: "zones" }],
  quantity: (a) => Number(a.zone_count) || 0,
  fallbackDescription: (a) => {
    const z = Number(a.zone_count) || 0;
    return `Install a ${z}-zone irrigation system, including heads, zone valves, controller and backflow preventer.`;
  },
};

export const plantsQuickQuote: QuickQuoteTemplate = {
  id: "plants",
  label: "Plants",
  pricingUnit: "$ / plant",
  lineItemUnit: "ea",
  defaultRate: 65,
  questions: [{ key: "plant_count", label: "Number of plants", type: "number", unit: "ea" }],
  quantity: (a) => Number(a.plant_count) || 0,
  fallbackDescription: (a) => `Supply and plant ${Number(a.plant_count) || 0} plants, including soil amendment and mulch.`,
};

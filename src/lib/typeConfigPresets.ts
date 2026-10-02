import { BUILD_TYPES } from "./buildTypes";
import { featureKindOf, type FeatureKind } from "./measurements";
import { findSmartSectionTemplate } from "./smartSections";
import { findQuickQuoteTemplate } from "./quickQuote";
import type { MeasureField, TypeConfig } from "./typeConfig";

/**
 * "Based on Paver Patio" — a starting setup copied from a built-in type:
 * measurement blocks equivalent to its card, its Smart Section line names
 * and calculator defaults, and its Quick Quote rate. The built-in
 * calculator math is code (catalog rounding, course math…), so the copy's
 * lines start without formulas — the contractor adds simple ones.
 */
const FIELDS_BY_KIND: Partial<Record<FeatureKind, MeasureField[]>> = {
  patio: [{ key: "area", kind: "area", label: "Area" }],
  flatwork: [{ key: "area", kind: "area", label: "Area" }],
  kitchen: [
    { key: "counter_length", kind: "runs", label: "Counter length" },
    { key: "counter_height", kind: "height", label: "Counter height", unit: "in" },
  ],
  seating_wall: [
    { key: "wall_length", kind: "runs", label: "Wall length" },
    { key: "wall_height", kind: "height", label: "Height", unit: "in" },
  ],
  retaining_wall: [
    { key: "wall_length", kind: "runs", label: "Wall length" },
    { key: "wall_height", kind: "height", label: "Height", unit: "ft" },
  ],
  fire_pit: [
    { key: "diameter", kind: "length", label: "Diameter" },
    { key: "pit_height", kind: "height", label: "Height", unit: "in" },
  ],
  fireplace: [
    { key: "width", kind: "length", label: "Width" },
    { key: "depth", kind: "length", label: "Depth" },
    { key: "height", kind: "height", label: "Overall height", unit: "ft" },
  ],
  lighting: [{ key: "fixtures", kind: "count", label: "Fixtures" }],
  steps: [
    { key: "steps", kind: "count", label: "Steps" },
    { key: "step_width", kind: "length", label: "Width" },
  ],
  irrigation: [
    { key: "zones", kind: "count", label: "Zones" },
    { key: "heads", kind: "count", label: "Heads / emitters" },
  ],
  pergola: [
    { key: "footprint", kind: "area", label: "Footprint" },
    { key: "height", kind: "height", label: "Height", unit: "ft" },
  ],
};

/** The built-in types a setup can start from (anything with a card or a template). */
export const PRESET_SOURCES = BUILD_TYPES.filter((b) => featureKindOf(b.id) || findSmartSectionTemplate(b.id)).map((b) => ({
  id: b.id,
  label: b.label,
}));

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function configFromBuiltIn(categoryId: string, buildType: string): TypeConfig {
  const kind = featureKindOf(buildType);
  const fields = (kind && FIELDS_BY_KIND[kind]) || [{ key: "quantity", kind: "count" as const, label: "Quantity" }];
  const smart = findSmartSectionTemplate(buildType);
  const qq = findQuickQuoteTemplate(buildType);
  // Price the first area / length / count block.
  const priced = fields.find((f) => f.kind === "area") ?? fields.find((f) => f.kind === "runs") ?? fields.find((f) => f.kind === "count") ?? null;
  return {
    category_id: categoryId,
    based_on: buildType,
    fields: fields.map((f) => ({ ...f })),
    summary_keys: fields.filter((f) => f.kind !== "notes" && f.kind !== "select").map((f) => f.key),
    line_items: (smart?.lineItemSlots ?? []).filter((s) => !s.addOn).map((s) => ({ id: newId(), name: s.defaultName, cost_type: "material", formula: null })),
    tunables: (smart?.tunables ?? []).map((t) => ({ key: t.key, label: t.label, unit: t.unit, value: t.defaultValue })),
    quick_quote: qq && priced ? { total_key: priced.key, rate: qq.defaultRate, unit_label: qq.lineItemUnit } : null,
  };
}

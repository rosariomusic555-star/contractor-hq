import type { AreaAndPerimeter, RawCalculatedLine, SmartSectionTemplate } from "./types";
import { numOr } from "./numOr";

/**
 * Pergola, Water Feature, Sod, Irrigation, Plants. Every number here is a
 * starting ASSUMPTION the contractor can change in Settings › Manage Smart
 * Section Templates (tunables) — the same way the original five work.
 */

const areaOf = (v: unknown): number => {
  const a = v as AreaAndPerimeter | number | null | undefined;
  if (typeof a === "number") return a;
  return Number(a?.areaSqft) || 0;
};

export const pergolaTemplate: SmartSectionTemplate = {
  id: "pergola",
  label: "Pergola",
  lineItemSlots: [
    { key: "posts", defaultName: "Posts" },
    { key: "beams", defaultName: "Beams" },
    { key: "rafters", defaultName: "Rafters" },
    { key: "purlins", defaultName: "Purlins / Top Slats" },
    { key: "footings", defaultName: "Concrete Footings" },
    { key: "hardware", defaultName: "Brackets & Hardware" },
  ],
  questions: [
    { key: "length_ft", label: "Length", type: "number", unit: "ft" },
    { key: "width_ft", label: "Width (depth)", type: "number", unit: "ft" },
  ],
  tunables: [
    { key: "post_spacing_ft", label: "Max post spacing", unit: "ft", defaultValue: 10, relatedSlotKey: "posts" }, // ASSUMPTION
    { key: "rafter_spacing_in", label: "Rafter spacing", unit: "in o.c.", defaultValue: 16, relatedSlotKey: "rafters" }, // ASSUMPTION
    { key: "purlin_spacing_in", label: "Purlin spacing", unit: "in o.c.", defaultValue: 12, relatedSlotKey: "purlins" }, // ASSUMPTION
    { key: "bags_per_footing", label: "Concrete bags per footing", unit: "bag", defaultValue: 3, relatedSlotKey: "footings" }, // ASSUMPTION (80 lb bags)
  ],
  calculate: (a) => {
    const L = Number(a.length_ft) || 0;
    const W = Number(a.width_ft) || 0;
    const spacing = Number(a.post_spacing_ft) || 10;
    const postsPerSide = L > 0 ? Math.ceil(L / spacing) + 1 : 0;
    const posts = postsPerSide * 2;
    const rafters = L > 0 ? Math.ceil((L * 12) / (Number(a.rafter_spacing_in) || 16)) + 1 : 0;
    const purlins = W > 0 ? Math.ceil((W * 12) / (Number(a.purlin_spacing_in) || 12)) + 1 : 0;
    const lines: RawCalculatedLine[] = [
      { slotKey: "posts", quantity: posts, unit: "ea" },
      { slotKey: "beams", quantity: L > 0 ? 2 : 0, unit: "ea" },
      { slotKey: "rafters", quantity: rafters, unit: "ea" },
      { slotKey: "purlins", quantity: purlins, unit: "ea" },
      { slotKey: "footings", quantity: posts * (Number(a.bags_per_footing) || 3), unit: "bag" },
      { slotKey: "hardware", quantity: posts > 0 ? 1 : 0, unit: "lot" },
    ];
    return lines;
  },
};

export const waterFeatureTemplate: SmartSectionTemplate = {
  id: "water_feature",
  label: "Water Feature",
  lineItemSlots: [
    { key: "liner", defaultName: "Pond Liner" },
    { key: "underlayment", defaultName: "Underlayment" },
    { key: "pump", defaultName: "Pump" },
    { key: "plumbing", defaultName: "Plumbing Kit / Tubing" },
    { key: "stone", defaultName: "Boulders & Stone" },
    { key: "gravel", defaultName: "River Gravel" },
  ],
  questions: [
    { key: "area", label: "Water feature footprint", type: "area_or_dimensions" },
    { key: "depth_ft", label: "Depth", type: "number", unit: "ft", defaultValue: 2 },
  ],
  tunables: [
    { key: "liner_overlap_ft", label: "Liner overlap each side", unit: "ft", defaultValue: 1, relatedSlotKey: "liner" }, // ASSUMPTION
    { key: "stone_tons_per_100sqft", label: "Stone per 100 sq ft", unit: "ton", defaultValue: 2, relatedSlotKey: "stone" }, // ASSUMPTION
    { key: "gravel_depth_in", label: "Gravel depth", unit: "in", defaultValue: 2, relatedSlotKey: "gravel" }, // ASSUMPTION
  ],
  calculate: (a) => {
    const area = areaOf(a.area);
    const side = Math.sqrt(area);
    const depth = Number(a.depth_ft) || 2;
    const rawOverlap = Number(a.liner_overlap_ft);
    const overlap = Number.isFinite(rawOverlap) && a.liner_overlap_ft != null ? rawOverlap : 1;
    // Liner: (side + 2×depth + 2×overlap)² — the usual pond-liner sizing on a square.
    const linerSide = side > 0 ? side + 2 * depth + 2 * overlap : 0;
    const liner = Math.ceil(linerSide * linerSide);
    return [
      { slotKey: "liner", quantity: liner, unit: "sq ft" },
      { slotKey: "underlayment", quantity: liner, unit: "sq ft" },
      { slotKey: "pump", quantity: area > 0 ? 1 : 0, unit: "ea" },
      { slotKey: "plumbing", quantity: area > 0 ? 1 : 0, unit: "kit" },
      { slotKey: "stone", quantity: Math.round(((area * (Number(a.stone_tons_per_100sqft) || 2)) / 100) * 10) / 10, unit: "ton" },
      { slotKey: "gravel", quantity: Math.round(((area * (numOr(a.gravel_depth_in, 2))) / 12 / 27) * 10) / 10, unit: "cu yd" },
    ];
  },
};

export const sodTemplate: SmartSectionTemplate = {
  id: "sod",
  label: "Sod",
  lineItemSlots: [
    { key: "sod", defaultName: "Sod" },
    { key: "topsoil", defaultName: "Topsoil" },
    { key: "fertilizer", defaultName: "Starter Fertilizer" },
  ],
  questions: [{ key: "area", label: "Lawn area", type: "area_or_dimensions" }],
  tunables: [
    { key: "waste_pct", label: "Waste", unit: "%", defaultValue: 5, relatedSlotKey: "sod" }, // ASSUMPTION
    { key: "sqft_per_pallet", label: "Sq ft per pallet", unit: "sq ft", defaultValue: 450, relatedSlotKey: "sod" }, // ASSUMPTION — varies by farm
    { key: "topsoil_depth_in", label: "Topsoil depth", unit: "in", defaultValue: 1, relatedSlotKey: "topsoil" }, // ASSUMPTION
    { key: "sqft_per_fert_bag", label: "Sq ft per fertilizer bag", unit: "sq ft", defaultValue: 5000, relatedSlotKey: "fertilizer" }, // ASSUMPTION
  ],
  calculate: (a) => {
    const area = areaOf(a.area);
    // Pallets of the measured area; the 5% waste goes on the line's Waste %,
    // and the Order Sheet rounds (area + waste) up to whole pallets.
    const waste = a.waste_pct == null ? 5 : Number(a.waste_pct) || 0;
    return [
      { slotKey: "sod", quantity: area > 0 ? Math.round((area / (Number(a.sqft_per_pallet) || 450)) * 100) / 100 : 0, unit: "pallet", wastePercent: waste },
      { slotKey: "topsoil", quantity: Math.round(((area * (numOr(a.topsoil_depth_in, 1))) / 12 / 27) * 10) / 10, unit: "cu yd" },
      { slotKey: "fertilizer", quantity: area > 0 ? Math.ceil(area / (Number(a.sqft_per_fert_bag) || 5000)) : 0, unit: "bag" },
    ];
  },
};

export const irrigationTemplate: SmartSectionTemplate = {
  id: "irrigation",
  label: "Irrigation",
  lineItemSlots: [
    { key: "heads", defaultName: "Spray / Rotor Heads" },
    { key: "pipe", defaultName: "Lateral Pipe" },
    { key: "valves", defaultName: "Zone Valves" },
    { key: "controller", defaultName: "Controller" },
    { key: "backflow", defaultName: "Backflow Preventer" },
    { key: "fittings", defaultName: "Fittings & Swing Joints" },
  ],
  // Zones / heads come straight from the Irrigation measurement card; area
  // is the fallback estimate when they're blank.
  questions: [
    { key: "zones", label: "Zones", type: "number", unit: "zones" },
    { key: "heads", label: "Heads / emitters", type: "number", unit: "ea" },
    { key: "area", label: "Area covered (if zones/heads unknown)", type: "area_or_dimensions" },
  ],
  tunables: [
    { key: "sqft_per_zone", label: "Sq ft per zone", unit: "sq ft", defaultValue: 1500, relatedSlotKey: "valves" }, // ASSUMPTION
    { key: "sqft_per_head", label: "Sq ft per head", unit: "sq ft", defaultValue: 200, relatedSlotKey: "heads" }, // ASSUMPTION
    { key: "pipe_ft_per_head", label: "Pipe per head", unit: "ft", defaultValue: 15, relatedSlotKey: "pipe" }, // ASSUMPTION
  ],
  calculate: (a) => {
    const area = areaOf(a.area);
    const heads = Number(a.heads) > 0 ? Math.ceil(Number(a.heads)) : area > 0 ? Math.ceil(area / (Number(a.sqft_per_head) || 200)) : 0;
    const zones = Number(a.zones) > 0 ? Math.ceil(Number(a.zones)) : area > 0 ? Math.ceil(area / (Number(a.sqft_per_zone) || 1500)) : 0;
    return [
      { slotKey: "heads", quantity: heads, unit: "ea" },
      { slotKey: "pipe", quantity: heads * (Number(a.pipe_ft_per_head) || 15), unit: "ft" },
      { slotKey: "valves", quantity: zones, unit: "ea" },
      { slotKey: "controller", quantity: zones > 0 ? 1 : 0, unit: "ea" },
      { slotKey: "backflow", quantity: zones > 0 ? 1 : 0, unit: "ea" },
      { slotKey: "fittings", quantity: heads, unit: "ea" },
    ];
  },
};

export const plantsTemplate: SmartSectionTemplate = {
  id: "plants",
  label: "Plants",
  lineItemSlots: [
    { key: "trees", defaultName: "Trees" },
    { key: "shrubs", defaultName: "Shrubs" },
    { key: "perennials", defaultName: "Perennials / Groundcover" },
    { key: "mulch", defaultName: "Mulch" },
    { key: "amendment", defaultName: "Soil Amendment" },
  ],
  questions: [
    { key: "trees", label: "Trees", type: "number", unit: "ea" },
    { key: "shrubs", label: "Shrubs", type: "number", unit: "ea" },
    { key: "perennials", label: "Perennials / groundcover", type: "number", unit: "ea" },
    { key: "bed_sqft", label: "Planting bed area (mulch)", type: "number", unit: "sq ft" },
  ],
  tunables: [
    { key: "mulch_depth_in", label: "Mulch depth", unit: "in", defaultValue: 3, relatedSlotKey: "mulch" }, // ASSUMPTION
    { key: "amendment_bags_per_plant", label: "Amendment per plant", unit: "bag", defaultValue: 0.5, relatedSlotKey: "amendment" }, // ASSUMPTION
  ],
  calculate: (a) => {
    const trees = Number(a.trees) || 0;
    const shrubs = Number(a.shrubs) || 0;
    const perennials = Number(a.perennials) || 0;
    const bed = Number(a.bed_sqft) || 0;
    return [
      { slotKey: "trees", quantity: trees, unit: "ea" },
      { slotKey: "shrubs", quantity: shrubs, unit: "ea" },
      { slotKey: "perennials", quantity: perennials, unit: "ea" },
      { slotKey: "mulch", quantity: Math.round(((bed * (numOr(a.mulch_depth_in, 3))) / 12 / 27) * 10) / 10, unit: "cu yd" },
      { slotKey: "amendment", quantity: Math.ceil((trees + shrubs) * (numOr(a.amendment_bags_per_plant, 0.5))), unit: "bag" },
    ];
  },
};

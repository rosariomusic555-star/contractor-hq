import type { RawCalculatedLine, SmartSectionTemplate } from "./types";

/**
 * Outdoor masonry fireplace: a CMU box on a concrete footing, a firebox kit,
 * a flue up through the chimney, stone veneer outside and a chimney cap.
 * Every number is a starting ASSUMPTION the contractor can change in
 * Settings › Manage Smart Section Templates (tunables). Sized from the
 * Measurements card (footprint, perimeter, height, veneer area).
 */
export const fireplaceTemplate: SmartSectionTemplate = {
  id: "fireplace",
  label: "Fireplace",
  lineItemSlots: [
    { key: "footing", defaultName: "Footing Concrete" },
    { key: "cmu_core", defaultName: "Concrete Block (Core)" },
    { key: "firebox", defaultName: "Firebox Kit / Firebrick" },
    { key: "flue", defaultName: "Chimney Flue Liner" },
    { key: "veneer", defaultName: "Stone Veneer" },
    { key: "mortar", defaultName: "Mortar" },
    { key: "chimney_cap", defaultName: "Chimney Cap" },
  ],
  questions: [
    { key: "footprint_sqft", label: "Footprint", type: "number", unit: "sq ft" },
    { key: "perimeter_ft", label: "Perimeter", type: "number", unit: "ft" },
    { key: "height_ft", label: "Overall height", type: "number", unit: "ft" },
    { key: "veneer_sqft", label: "Veneer area", type: "number", unit: "sq ft" },
  ],
  tunables: [
    { key: "footing_depth_in", label: "Footing depth", unit: "in", defaultValue: 12, relatedSlotKey: "footing" }, // ASSUMPTION
    { key: "footing_overhang_ft", label: "Footing past the walls (each side)", unit: "ft", defaultValue: 0.5, relatedSlotKey: "footing" }, // ASSUMPTION
    { key: "cmu_face_sqft", label: "Block face area", unit: "sq ft", defaultValue: 0.89, relatedSlotKey: "cmu_core" }, // 8×16 in nominal
    { key: "firebox_height_ft", label: "Firebox height (flue starts above it)", unit: "ft", defaultValue: 3, relatedSlotKey: "flue" }, // ASSUMPTION
    { key: "veneer_waste_pct", label: "Waste", unit: "%", defaultValue: 10, relatedSlotKey: "veneer" }, // ASSUMPTION
    { key: "mortar_bags_per_100sqft", label: "Bags per 100 sq ft (block + veneer)", unit: "bag", defaultValue: 8, relatedSlotKey: "mortar" }, // ASSUMPTION
  ],
  calculate: (a) => {
    const footprint = Number(a.footprint_sqft) || 0;
    const perimeter = Number(a.perimeter_ft) || 0;
    const height = Number(a.height_ft) || 0;
    const veneer = Number(a.veneer_sqft) || 0;
    const overhang = Number(a.footing_overhang_ft);
    const over = Number.isFinite(overhang) && a.footing_overhang_ft != null ? overhang : 0.5;

    // Footing: footprint grown by the overhang on every side (a square-ish box).
    const side = Math.sqrt(footprint);
    const footingSqft = footprint > 0 ? (side + 2 * over) ** 2 : 0;
    const footingCuYd = (footingSqft * (Number(a.footing_depth_in) || 12)) / 12 / 27;
    const blockFaceSqft = perimeter * height;
    const blocks = blockFaceSqft > 0 ? Math.ceil(blockFaceSqft / (Number(a.cmu_face_sqft) || 0.89)) : 0;
    const flueFt = Math.max(0, height - (Number(a.firebox_height_ft) || 3));
    const waste = a.veneer_waste_pct == null ? 10 : Number(a.veneer_waste_pct) || 0;
    const veneerOrder = Math.ceil(Math.round(veneer * (1 + waste / 100) * 100) / 100);
    const mortarBags = Math.ceil(((blockFaceSqft + veneer) / 100) * (Number(a.mortar_bags_per_100sqft) || 8));

    const lines: RawCalculatedLine[] = [
      { slotKey: "footing", quantity: Math.round(footingCuYd * 10) / 10, unit: "cu yd" },
      { slotKey: "cmu_core", quantity: blocks, unit: "pieces" },
      { slotKey: "firebox", quantity: footprint > 0 ? 1 : 0, unit: "kit" },
      { slotKey: "flue", quantity: Math.ceil(flueFt), unit: "ft" },
      { slotKey: "veneer", quantity: veneerOrder, unit: "sq ft" },
      { slotKey: "mortar", quantity: mortarBags, unit: "bag" },
      { slotKey: "chimney_cap", quantity: footprint > 0 ? 1 : 0, unit: "ea" },
    ];
    return lines;
  },
};

import type { ProductCatalogItem } from "@/lib/api";
import type { RawCalculatedLine, SmartSectionTemplate } from "./types";
import { numOr } from "./numOr";

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

// Kept deliberately simple per spec — no circumference/diameter geometry,
// no shape assumptions. Footprint and interior fill area are asked
// directly rather than derived, since fire pits aren't reliably round or
// square and this app has no per-product block dimensions to do real
// circular layout math. Treated the same structurally as Seating Wall
// (linear-foot based), just with a couple of directly-asked areas.
export const firePitTemplate: SmartSectionTemplate = {
  id: "fire_pit",
  label: "Fire Pit",
  lineItemSlots: [
    { key: "wall_block", defaultName: "Wall Block" },
    { key: "caps", defaultName: "Caps" },
    { key: "base_material", defaultName: "Base Material" },
    { key: "crushed_stone_interior_fill", defaultName: "Crushed Stone / Interior Fill" },
    { key: "fire_brick_fire_ring_liner", defaultName: "Fire Brick / Fire Ring Liner" },
    { key: "construction_adhesive", defaultName: "Construction Adhesive" },
  ],
  questions: [
    { key: "wall_length_ft", label: "Total linear feet of wall", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block product", type: "catalog_product", category: "Wall Block" },
    { key: "cap", label: "Cap product", type: "catalog_product", category: "Caps" },
    { key: "courses", label: "Number of courses", type: "number", unit: "courses", defaultValue: 3 },
    { key: "footprint_sqft", label: "Footprint (for base material)", type: "number", unit: "sq ft" },
    { key: "interior_sqft", label: "Interior fill area", type: "number", unit: "sq ft" },
    { key: "include_fire_ring", label: "Include fire ring/insert?", type: "toggle", defaultValue: false },
  ],
  tunables: [
    { key: "courses", label: "Default courses", unit: "courses", defaultValue: 3, relatedSlotKey: "wall_block" },
    // Not used by calculate() — the default height a new fire pit gets on
    // the Measurements card (src/lib/measurements.ts FIRE_PIT_HEIGHT_TUNABLE).
    // Lives here so it's edited alongside the other fire pit defaults.
    { key: "pit_height_in", label: "Default pit height (Measurements)", unit: "in", defaultValue: 18, relatedSlotKey: "wall_block" },
    { key: "block_face_length_in", label: "Face length", unit: "in", defaultValue: 8, relatedSlotKey: "wall_block" }, // ASSUMPTION
    { key: "cap_length_in", label: "Cap length", unit: "in", defaultValue: 12, relatedSlotKey: "caps" }, // ASSUMPTION
    {
      key: "base_depth_in",
      label: "Base depth",
      unit: "in",
      defaultValue: 6,
      relatedSlotKey: "base_material",
    },
    {
      key: "base_coverage_sqft_per_ton",
      label: "Coverage at 1 in deep",
      unit: "sq ft per ton, 1 in deep",
      defaultValue: 165, // ASSUMPTION
      relatedSlotKey: "base_material",
    },
    {
      key: "fill_depth_in",
      label: "Fill depth",
      unit: "in",
      defaultValue: 6,
      relatedSlotKey: "crushed_stone_interior_fill",
    },
    {
      key: "fill_coverage_sqft_per_ton",
      label: "Coverage at 1 in deep",
      unit: "sq ft per ton, 1 in deep",
      // ASSUMPTION — decorative crushed stone is typically lighter/looser
      // than compacted base, kept independently editable from Base
      // Material's coverage for exactly that reason.
      defaultValue: 165,
      relatedSlotKey: "crushed_stone_interior_fill",
    },
    {
      key: "adhesive_pieces_per_tube",
      label: "Coverage",
      unit: "pieces/tube",
      defaultValue: 30, // ASSUMPTION
      relatedSlotKey: "construction_adhesive",
    },
  ],
  calculate: (answers) => {
    const wallLengthFt = Number(answers.wall_length_ft) || 0;
    const courses = Number(answers.courses) || 3;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const cap = (answers.cap as ProductCatalogItem | null) ?? null;
    const footprintSqft = Number(answers.footprint_sqft) || 0;
    const interiorSqft = Number(answers.interior_sqft) || 0;
    const includeFireRing = answers.include_fire_ring === true;

    const blockFaceLengthFt = (Number(answers.block_face_length_in) || 8) / 12;
    const capLengthFt = (Number(answers.cap_length_in) || 12) / 12;
    const baseDepthIn = numOr(answers.base_depth_in, 6);
    const baseCoverageSqftPerTon = Number(answers.base_coverage_sqft_per_ton) || 165;
    const fillDepthIn = numOr(answers.fill_depth_in, 6);
    const fillCoverageSqftPerTon = Number(answers.fill_coverage_sqft_per_ton) || 165;
    const adhesivePiecesPerTube = Number(answers.adhesive_pieces_per_tube) || 30;

    const lines: RawCalculatedLine[] = [];

    const wallBlockPieces = Math.ceil(wallLengthFt / blockFaceLengthFt) * courses;
    lines.push({ slotKey: "wall_block", quantity: wallBlockPieces, unit: "pieces", catalogProduct: wallBlock });

    const capPieces = Math.ceil(wallLengthFt / capLengthFt);
    lines.push({ slotKey: "caps", quantity: capPieces, unit: "pieces", catalogProduct: cap });

    lines.push({
      slotKey: "base_material",
      quantity: roundUpToHalfTon((footprintSqft * baseDepthIn) / baseCoverageSqftPerTon),
      unit: "ton",
    });

    lines.push({
      slotKey: "crushed_stone_interior_fill",
      quantity: roundUpToHalfTon((interiorSqft * fillDepthIn) / fillCoverageSqftPerTon),
      unit: "ton",
    });

    if (includeFireRing) {
      // No quantity math — just a flag to include the line, per spec.
      lines.push({ slotKey: "fire_brick_fire_ring_liner", quantity: 1, unit: "kit" });
    }
    // else: not included this run — line left untouched.

    lines.push({
      slotKey: "construction_adhesive",
      quantity: Math.ceil((wallBlockPieces + capPieces) / adhesivePiecesPerTube),
      unit: "tube",
    });

    return lines;
  },
};

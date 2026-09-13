import type { ProductCatalogItem } from "@/lib/api";
import type { CalculatedLine, SmartSectionTemplate } from "./types";

// Kept deliberately simple per spec — no circumference/diameter geometry,
// no shape assumptions. Footprint and interior fill area are asked
// directly rather than derived, since fire pits aren't reliably round or
// square and this app has no per-product block dimensions to do real
// circular layout math. Treated the same structurally as Seating Wall
// (linear-foot based), just with a couple of directly-asked areas.
const BLOCK_FACE_LENGTH_FT = 8 / 12; // 8" nominal face per wall block — ASSUMPTION
const CAP_LENGTH_FT = 1; // 12" nominal cap length — ASSUMPTION
const BASE_DEPTH_IN = 6; // compacted base under footprint — ASSUMPTION
const FILL_DEPTH_IN = 6; // interior fill depth — ASSUMPTION
const ADHESIVE_PIECES_PER_TUBE = 30; // rough — ASSUMPTION

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

export const firePitTemplate: SmartSectionTemplate = {
  id: "fire_pit",
  label: "Fire Pit",
  lineItems: [
    "Wall Block",
    "Caps",
    "Base Material",
    "Crushed Stone / Interior Fill",
    "Fire Brick / Fire Ring Liner",
    "Construction Adhesive",
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
  calculate: (answers) => {
    const wallLengthFt = Number(answers.wall_length_ft) || 0;
    const courses = Number(answers.courses) || 3;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const cap = (answers.cap as ProductCatalogItem | null) ?? null;
    const footprintSqft = Number(answers.footprint_sqft) || 0;
    const interiorSqft = Number(answers.interior_sqft) || 0;
    const includeFireRing = answers.include_fire_ring === true;

    const lines: CalculatedLine[] = [];

    const wallBlockPieces = Math.ceil(wallLengthFt / BLOCK_FACE_LENGTH_FT) * courses;
    lines.push({ name: "Wall Block", quantity: wallBlockPieces, unit: "pieces", catalogProduct: wallBlock });

    const capPieces = Math.ceil(wallLengthFt / CAP_LENGTH_FT);
    lines.push({ name: "Caps", quantity: capPieces, unit: "pieces", catalogProduct: cap });

    // Same area x depth / 165 constant as Paver Patio's base material
    // (1 ton covers 33 sq ft at 5" depth), depth-adjusted for a 6" base.
    lines.push({
      name: "Base Material",
      quantity: roundUpToHalfTon((footprintSqft * BASE_DEPTH_IN) / 165),
      unit: "ton",
    });

    // Reuses the same constant as a stand-in — decorative crushed stone is
    // typically lighter/looser than compacted base, so this may over- or
    // under-state real tonnage. Flagged for verification.
    lines.push({
      name: "Crushed Stone / Interior Fill",
      quantity: roundUpToHalfTon((interiorSqft * FILL_DEPTH_IN) / 165),
      unit: "ton",
    });

    if (includeFireRing) {
      // No quantity math — just a flag to include the line, per spec.
      lines.push({ name: "Fire Brick / Fire Ring Liner", quantity: 1, unit: "kit" });
    }
    // else: not included this run — line left untouched.

    lines.push({
      name: "Construction Adhesive",
      quantity: Math.ceil((wallBlockPieces + capPieces) / ADHESIVE_PIECES_PER_TUBE),
      unit: "tube",
    });

    return lines;
  },
};

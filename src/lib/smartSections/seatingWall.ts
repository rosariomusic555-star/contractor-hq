import type { ProductCatalogItem } from "@/lib/api";
import type { CalculatedLine, SmartSectionTemplate } from "./types";

// ASSUMPTION constants — none of this math has been verified against real
// supplier specs.
const BLOCK_FACE_LENGTH_FT = 8 / 12; // 8" nominal face per wall block
const CAP_LENGTH_FT = 1; // 12" nominal cap length
const COURSE_HEIGHT_FT = 9 / 12; // 9" per course (seating-wall block convention)
const TRENCH_WIDTH_FT = 1.5;
const TRENCH_DEPTH_FT = 0.5; // 6"
const TONS_PER_CUYD = 1.35; // compacted aggregate density approximation
const DRAINAGE_HEIGHT_THRESHOLD_FT = 1.5; // 18" — rough rule of thumb, not an engineering standard
const DRAINAGE_TRENCH_WIDTH_FT = 1;
const DRAINAGE_TRENCH_DEPTH_FT = 1;
const CAP_ADHESIVE_COVERAGE_FT_PER_TUBE = 20;

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

export const seatingWallTemplate: SmartSectionTemplate = {
  id: "seating_wall",
  label: "Seating Wall",
  lineItems: ["Wall Block", "Caps", "Base Material", "Drainage Gravel", "Construction Adhesive"],
  questions: [
    { key: "length_ft", label: "Linear feet of wall", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block product", type: "catalog_product", category: "Wall Block" },
    { key: "cap", label: "Cap product", type: "catalog_product", category: "Caps" },
    { key: "courses", label: "Wall height (courses)", type: "number", unit: "courses", defaultValue: 2 },
  ],
  calculate: (answers) => {
    const lengthFt = Number(answers.length_ft) || 0;
    const courses = Number(answers.courses) || 2;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const cap = (answers.cap as ProductCatalogItem | null) ?? null;

    const lines: CalculatedLine[] = [];

    lines.push({
      name: "Wall Block",
      quantity: Math.ceil(lengthFt / BLOCK_FACE_LENGTH_FT) * courses,
      unit: "pieces",
      catalogProduct: wallBlock,
    });

    lines.push({
      name: "Caps",
      quantity: Math.ceil(lengthFt / CAP_LENGTH_FT),
      unit: "pieces",
      catalogProduct: cap,
    });

    const baseTons =
      ((lengthFt * TRENCH_WIDTH_FT * TRENCH_DEPTH_FT) / 27) * TONS_PER_CUYD;
    lines.push({ name: "Base Material", quantity: roundUpToHalfTon(baseTons), unit: "ton" });

    const wallHeightFt = courses * COURSE_HEIGHT_FT;
    if (wallHeightFt > DRAINAGE_HEIGHT_THRESHOLD_FT) {
      const drainageTons =
        ((lengthFt * DRAINAGE_TRENCH_WIDTH_FT * DRAINAGE_TRENCH_DEPTH_FT) / 27) * TONS_PER_CUYD;
      lines.push({ name: "Drainage Gravel", quantity: roundUpToHalfTon(drainageTons), unit: "ton" });
    }
    // else: below the rule-of-thumb height threshold — line left untouched.

    lines.push({
      name: "Construction Adhesive",
      quantity: Math.ceil(lengthFt / CAP_ADHESIVE_COVERAGE_FT_PER_TUBE),
      unit: "tube",
    });

    return lines;
  },
};

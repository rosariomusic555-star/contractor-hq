import type { ProductCatalogItem } from "@/lib/api";
import type { RawCalculatedLine, SmartSectionTemplate } from "./types";

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

export const seatingWallTemplate: SmartSectionTemplate = {
  id: "seating_wall",
  label: "Seating Wall",
  lineItemSlots: [
    { key: "wall_block", defaultName: "Wall Block" },
    { key: "caps", defaultName: "Caps" },
    { key: "base_material", defaultName: "Base Material" },
    { key: "drainage_gravel", defaultName: "Drainage Gravel" },
    { key: "construction_adhesive", defaultName: "Construction Adhesive" },
  ],
  questions: [
    { key: "length_ft", label: "Linear feet of wall", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block product", type: "catalog_product", category: "Wall Block" },
    { key: "cap", label: "Cap product", type: "catalog_product", category: "Caps" },
    { key: "courses", label: "Wall height (courses)", type: "number", unit: "courses", defaultValue: 2 },
  ],
  tunables: [
    { key: "courses", label: "Default courses", unit: "courses", defaultValue: 2, relatedSlotKey: "wall_block" },
    {
      key: "block_face_length_in",
      label: "Face length",
      unit: "in",
      defaultValue: 8, // ASSUMPTION
      relatedSlotKey: "wall_block",
    },
    {
      key: "course_height_in",
      label: "Course height",
      unit: "in",
      defaultValue: 9, // ASSUMPTION — seating-wall block convention
      relatedSlotKey: "wall_block",
    },
    { key: "cap_length_in", label: "Cap length", unit: "in", defaultValue: 12, relatedSlotKey: "caps" }, // ASSUMPTION
    {
      key: "trench_width_ft",
      label: "Trench width",
      unit: "ft",
      defaultValue: 1.5,
      relatedSlotKey: "base_material",
    },
    {
      key: "trench_depth_ft",
      label: "Trench depth",
      unit: "ft",
      defaultValue: 0.5,
      relatedSlotKey: "base_material",
    },
    {
      key: "tons_per_cuyd",
      label: "Density (shared with Drainage Gravel)",
      unit: "ton/cy",
      defaultValue: 1.35, // ASSUMPTION — compacted aggregate density approximation
      relatedSlotKey: "base_material",
    },
    {
      key: "drainage_height_threshold_ft",
      label: "Height that triggers drainage",
      unit: "ft",
      defaultValue: 1.5, // rough rule of thumb, not an engineering standard
      relatedSlotKey: "drainage_gravel",
    },
    {
      key: "drainage_trench_width_ft",
      label: "Drainage trench width",
      unit: "ft",
      defaultValue: 1,
      relatedSlotKey: "drainage_gravel",
    },
    {
      key: "drainage_trench_depth_ft",
      label: "Drainage trench depth",
      unit: "ft",
      defaultValue: 1,
      relatedSlotKey: "drainage_gravel",
    },
    {
      key: "cap_adhesive_coverage_ft_per_tube",
      label: "Coverage",
      unit: "linear ft/tube",
      defaultValue: 20, // ASSUMPTION
      relatedSlotKey: "construction_adhesive",
    },
  ],
  calculate: (answers) => {
    const lengthFt = Number(answers.length_ft) || 0;
    const courses = Number(answers.courses) || 2;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const cap = (answers.cap as ProductCatalogItem | null) ?? null;

    const blockFaceLengthFt = (Number(answers.block_face_length_in) || 8) / 12;
    const courseHeightFt = (Number(answers.course_height_in) || 9) / 12;
    const capLengthFt = (Number(answers.cap_length_in) || 12) / 12;
    const trenchWidthFt = Number(answers.trench_width_ft) || 1.5;
    const trenchDepthFt = Number(answers.trench_depth_ft) || 0.5;
    const tonsPerCuyd = Number(answers.tons_per_cuyd) || 1.35;
    const drainageHeightThresholdFt = Number(answers.drainage_height_threshold_ft) || 1.5;
    const drainageTrenchWidthFt = Number(answers.drainage_trench_width_ft) || 1;
    const drainageTrenchDepthFt = Number(answers.drainage_trench_depth_ft) || 1;
    const capAdhesiveCoverageFtPerTube = Number(answers.cap_adhesive_coverage_ft_per_tube) || 20;

    const lines: RawCalculatedLine[] = [];

    lines.push({
      slotKey: "wall_block",
      quantity: Math.ceil(lengthFt / blockFaceLengthFt) * courses,
      unit: "pieces",
      catalogProduct: wallBlock,
    });

    lines.push({
      slotKey: "caps",
      quantity: Math.ceil(lengthFt / capLengthFt),
      unit: "pieces",
      catalogProduct: cap,
    });

    const baseTons = ((lengthFt * trenchWidthFt * trenchDepthFt) / 27) * tonsPerCuyd;
    lines.push({ slotKey: "base_material", quantity: roundUpToHalfTon(baseTons), unit: "ton" });

    const wallHeightFt = courses * courseHeightFt;
    if (wallHeightFt > drainageHeightThresholdFt) {
      const drainageTons = ((lengthFt * drainageTrenchWidthFt * drainageTrenchDepthFt) / 27) * tonsPerCuyd;
      lines.push({ slotKey: "drainage_gravel", quantity: roundUpToHalfTon(drainageTons), unit: "ton" });
    }
    // else: below the rule-of-thumb height threshold — line left untouched.

    lines.push({
      slotKey: "construction_adhesive",
      quantity: Math.ceil(lengthFt / capAdhesiveCoverageFtPerTube),
      unit: "tube",
    });

    return lines;
  },
};

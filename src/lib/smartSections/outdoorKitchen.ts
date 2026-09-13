import type { ProductCatalogItem } from "@/lib/api";
import type { CalculatedLine, SmartSectionTemplate } from "./types";

// ASSUMPTION constants — none of this math has been verified against real
// supplier specs. Flagged individually below; treat every generated line
// here as a rough starting estimate, not a locked order quantity.
const VENEER_FACE_LENGTH_FT = 8 / 12; // 8" nominal face per block/veneer piece
const CMU_FACE_LENGTH_FT = 16 / 12; // 16" nominal CMU length
const COURSE_HEIGHT_FT = 8 / 12; // 8" per course (CMU convention)
const REBAR_CORE_SPACING_FT = 32 / 12; // vertical cores every 32" o.c.
const MORTAR_CUFT_PER_LINEAR_FT_PER_COURSE = 0.15; // rough core-fill estimate
const CUFT_PER_MORTAR_BAG = 0.6; // typical 80lb bag yield
const ADHESIVE_COVERAGE_SQFT_PER_TUBE = 15;
const CAP_LENGTH_FT = 1; // 12" nominal cap length

export const outdoorKitchenTemplate: SmartSectionTemplate = {
  id: "outdoor_kitchen",
  label: "Outdoor Kitchen",
  lineItems: [
    "Wall Block / Veneer",
    "Concrete Block (Core)",
    "Rebar",
    "Concrete Mix / Mortar",
    "Countertop Material",
    "Construction Adhesive",
    "Caps",
  ],
  questions: [
    // V1 scope: a single straight run only — L-shaped footprints (summing
    // two runs) are a natural follow-up, not built here.
    { key: "run_ft", label: "Total linear feet of kitchen run", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block / veneer product", type: "catalog_product", category: "Wall Block" },
    { key: "courses", label: "Number of courses", type: "number", unit: "courses", defaultValue: 3 },
    {
      key: "countertop_mode",
      label: "Countertop material",
      type: "select",
      options: [
        { value: "catalog", label: "Pick from Catalog" },
        { value: "separate", label: "Sourcing separately" },
      ],
      defaultValue: "catalog",
    },
    {
      key: "countertop_product",
      label: "Countertop product",
      type: "catalog_product",
      showWhen: { key: "countertop_mode", equals: "catalog" },
    },
  ],
  calculate: (answers) => {
    const runFt = Number(answers.run_ft) || 0;
    const courses = Number(answers.courses) || 3;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const countertopMode = (answers.countertop_mode as string) ?? "catalog";
    const countertopProduct =
      countertopMode === "catalog" ? ((answers.countertop_product as ProductCatalogItem | null) ?? null) : null;

    const wallHeightFt = courses * COURSE_HEIGHT_FT;
    const lines: CalculatedLine[] = [];

    const veneerPieces = Math.ceil(runFt / VENEER_FACE_LENGTH_FT) * courses;
    lines.push({ name: "Wall Block / Veneer", quantity: veneerPieces, unit: "pieces", catalogProduct: wallBlock });

    const corePieces = Math.ceil(runFt / CMU_FACE_LENGTH_FT) * courses;
    lines.push({ name: "Concrete Block (Core)", quantity: corePieces, unit: "pieces" });

    // Rebar: one vertical bar per core position, full wall height each.
    const coreCount = Math.ceil(runFt / REBAR_CORE_SPACING_FT) + 1;
    lines.push({ name: "Rebar", quantity: Math.ceil(coreCount * wallHeightFt), unit: "ft" });

    const mortarCuFt = runFt * courses * MORTAR_CUFT_PER_LINEAR_FT_PER_COURSE;
    lines.push({ name: "Concrete Mix / Mortar", quantity: Math.ceil(mortarCuFt / CUFT_PER_MORTAR_BAG), unit: "bag" });

    if (countertopMode === "catalog") {
      lines.push({ name: "Countertop Material", quantity: Math.ceil(runFt), unit: "ft", catalogProduct: countertopProduct });
    }
    // else: sourcing separately — leave the existing line untouched.

    const veneerSqft = runFt * wallHeightFt;
    lines.push({
      name: "Construction Adhesive",
      quantity: Math.ceil(veneerSqft / ADHESIVE_COVERAGE_SQFT_PER_TUBE),
      unit: "tube",
    });

    lines.push({ name: "Caps", quantity: Math.ceil(runFt / CAP_LENGTH_FT), unit: "pieces" });

    return lines;
  },
};

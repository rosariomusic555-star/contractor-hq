import type { ProductCatalogItem } from "@/lib/api";
import type { RawCalculatedLine, SmartSectionTemplate } from "./types";

export const outdoorKitchenTemplate: SmartSectionTemplate = {
  id: "outdoor_kitchen",
  label: "Outdoor Kitchen",
  lineItemSlots: [
    { key: "wall_block_veneer", defaultName: "Wall Block / Veneer" },
    { key: "concrete_block_core", defaultName: "Concrete Block (Core)" },
    { key: "rebar", defaultName: "Rebar" },
    { key: "concrete_mix_mortar", defaultName: "Concrete Mix / Mortar" },
    { key: "countertop_material", defaultName: "Countertop Material" },
    { key: "construction_adhesive", defaultName: "Construction Adhesive" },
    { key: "caps", defaultName: "Caps" },
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
  tunables: [
    { key: "courses", label: "Default courses", unit: "courses", defaultValue: 3, relatedSlotKey: "concrete_block_core" },
    {
      key: "veneer_face_length_in",
      label: "Face length",
      unit: "in",
      defaultValue: 8, // ASSUMPTION
      relatedSlotKey: "wall_block_veneer",
    },
    {
      key: "cmu_face_length_in",
      label: "Face length",
      unit: "in",
      defaultValue: 16, // ASSUMPTION — standard CMU nominal length
      relatedSlotKey: "concrete_block_core",
    },
    {
      key: "course_height_in",
      label: "Course height",
      unit: "in",
      defaultValue: 8, // ASSUMPTION — CMU convention
      relatedSlotKey: "concrete_block_core",
    },
    {
      key: "rebar_core_spacing_in",
      label: "Vertical core spacing",
      unit: "in",
      defaultValue: 32, // ASSUMPTION
      relatedSlotKey: "rebar",
    },
    {
      key: "mortar_cuft_per_linear_ft_per_course",
      label: "Fill rate",
      unit: "cu ft / linear ft / course",
      defaultValue: 0.15, // ASSUMPTION — rough core-fill estimate
      relatedSlotKey: "concrete_mix_mortar",
    },
    {
      key: "mortar_cuft_per_bag",
      label: "Bag yield",
      unit: "cu ft/bag",
      defaultValue: 0.6, // ASSUMPTION — typical 80lb bag yield
      relatedSlotKey: "concrete_mix_mortar",
    },
    {
      key: "adhesive_coverage_sqft_per_tube",
      label: "Coverage",
      unit: "sq ft/tube",
      defaultValue: 15, // ASSUMPTION
      relatedSlotKey: "construction_adhesive",
    },
    {
      key: "cap_length_in",
      label: "Cap length",
      unit: "in",
      defaultValue: 12, // ASSUMPTION
      relatedSlotKey: "caps",
    },
  ],
  calculate: (answers) => {
    const runFt = Number(answers.run_ft) || 0;
    const courses = Number(answers.courses) || 3;
    const wallBlock = (answers.wall_block as ProductCatalogItem | null) ?? null;
    const countertopMode = (answers.countertop_mode as string) ?? "catalog";
    const countertopProduct =
      countertopMode === "catalog" ? ((answers.countertop_product as ProductCatalogItem | null) ?? null) : null;

    const veneerFaceLengthFt = (Number(answers.veneer_face_length_in) || 8) / 12;
    const cmuFaceLengthFt = (Number(answers.cmu_face_length_in) || 16) / 12;
    const courseHeightFt = (Number(answers.course_height_in) || 8) / 12;
    const rebarCoreSpacingFt = (Number(answers.rebar_core_spacing_in) || 32) / 12;
    const mortarCuftPerLinearFtPerCourse = Number(answers.mortar_cuft_per_linear_ft_per_course) || 0.15;
    const mortarCuftPerBag = Number(answers.mortar_cuft_per_bag) || 0.6;
    const adhesiveCoverageSqftPerTube = Number(answers.adhesive_coverage_sqft_per_tube) || 15;
    const capLengthFt = (Number(answers.cap_length_in) || 12) / 12;

    const wallHeightFt = courses * courseHeightFt;
    const lines: RawCalculatedLine[] = [];

    const veneerPieces = Math.ceil(runFt / veneerFaceLengthFt) * courses;
    lines.push({ slotKey: "wall_block_veneer", quantity: veneerPieces, unit: "pieces", catalogProduct: wallBlock });

    const corePieces = Math.ceil(runFt / cmuFaceLengthFt) * courses;
    lines.push({ slotKey: "concrete_block_core", quantity: corePieces, unit: "pieces" });

    // Rebar: one vertical bar per core position, full wall height each.
    const coreCount = Math.ceil(runFt / rebarCoreSpacingFt) + 1;
    lines.push({ slotKey: "rebar", quantity: Math.ceil(coreCount * wallHeightFt), unit: "ft" });

    const mortarCuFt = runFt * courses * mortarCuftPerLinearFtPerCourse;
    lines.push({ slotKey: "concrete_mix_mortar", quantity: Math.ceil(mortarCuFt / mortarCuftPerBag), unit: "bag" });

    if (countertopMode === "catalog") {
      lines.push({
        slotKey: "countertop_material",
        quantity: Math.ceil(runFt),
        unit: "ft",
        catalogProduct: countertopProduct,
      });
    }
    // else: sourcing separately — leave the existing line untouched.

    const veneerSqft = runFt * wallHeightFt;
    lines.push({
      slotKey: "construction_adhesive",
      quantity: Math.ceil(veneerSqft / adhesiveCoverageSqftPerTube),
      unit: "tube",
    });

    lines.push({ slotKey: "caps", quantity: Math.ceil(runFt / capLengthFt), unit: "pieces" });

    return lines;
  },
};

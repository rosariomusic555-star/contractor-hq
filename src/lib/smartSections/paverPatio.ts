import type { ProductCatalogItem } from "@/lib/api";
import { ceilClean, roundUpToOrderable } from "@/lib/catalogOrdering";
import type { AreaAndPerimeter, RawCalculatedLine, SmartSectionTemplate } from "./types";
import { numOr } from "./numOr";

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

export const paverPatioTemplate: SmartSectionTemplate = {
  id: "paver_patio",
  label: "Paver Patio",
  lineItemSlots: [
    { key: "pavers", defaultName: "Pavers" },
    { key: "border_pavers", defaultName: "Border/Edge Pavers" },
    { key: "base_material", defaultName: "Base Material" },
    { key: "bedding_sand", defaultName: "Bedding Sand" },
    { key: "geotextile_fabric", defaultName: "Geotextile Fabric" },
    { key: "edge_restraint", defaultName: "Edge Restraint" },
    { key: "polymeric_sand", defaultName: "Polymeric Sand" },
  ],
  questions: [
    { key: "area", label: "Patio size", type: "area_or_dimensions" },
    { key: "paver", label: "Paver product", type: "catalog_product", category: "Pavers" },
    { key: "include_border", label: "Include border/edge pavers?", type: "toggle", defaultValue: false },
    {
      key: "border_paver",
      label: "Border/edge paver product",
      type: "catalog_product",
      category: "Pavers",
      showWhen: { key: "include_border", equals: true },
    },
    { key: "base_depth_in", label: "Base depth", type: "number", unit: "in", defaultValue: 5, step: "0.5" },
  ],
  // Every number here is also editable per contractor (Settings > Manage
  // Smart Section Templates) — these are just the app's shipped defaults.
  tunables: [
    { key: "base_depth_in", label: "Default depth", unit: "in", defaultValue: 5, relatedSlotKey: "base_material" },
    {
      key: "base_coverage_sqft_per_ton",
      label: "Coverage at 1 in deep",
      unit: "sq ft per ton, 1 in deep",
      defaultValue: 165, // ASSUMPTION: 1 ton covers 33 sq ft at 5" depth (33 x 5 = 165)
      relatedSlotKey: "base_material",
    },
    {
      key: "bedding_depth_in",
      label: "Bedding depth",
      unit: "in",
      defaultValue: 1,
      relatedSlotKey: "bedding_sand",
    },
    {
      key: "bedding_coverage_sqft_per_ton",
      label: "Coverage at 1 in deep",
      unit: "sq ft per ton, 1 in deep",
      defaultValue: 200, // ASSUMPTION — varies by supplier
      relatedSlotKey: "bedding_sand",
    },
    {
      key: "polymeric_coverage_sqft_per_bag",
      label: "Coverage",
      unit: "sq ft/bag",
      defaultValue: 80, // ASSUMPTION — varies by joint width/depth
      relatedSlotKey: "polymeric_sand",
    },
    {
      key: "geotextile_coverage_sqft_per_roll",
      label: "Roll coverage",
      unit: "sq ft/roll",
      defaultValue: 900, // ASSUMPTION — roll sizes vary enormously by supplier
      relatedSlotKey: "geotextile_fabric",
    },
    {
      key: "border_band_width_ft",
      label: "Border band width",
      unit: "ft",
      defaultValue: 1, // ASSUMPTION — real coverage depends on the specific border paver's width
      relatedSlotKey: "border_pavers",
    },
  ],
  calculate: (answers) => {
    const { areaSqft, perimeterFt } = (answers.area as AreaAndPerimeter | undefined) ?? {
      areaSqft: 0,
      perimeterFt: 0,
    };
    const paver = (answers.paver as ProductCatalogItem | null) ?? null;
    const includeBorder = answers.include_border === true;
    const borderPaver = includeBorder ? ((answers.border_paver as ProductCatalogItem | null) ?? null) : null;
    const baseDepthIn = numOr(answers.base_depth_in, 5);
    const baseCoverageSqftPerTon = Number(answers.base_coverage_sqft_per_ton) || 165;
    const beddingDepthIn = numOr(answers.bedding_depth_in, 1);
    const beddingCoverageSqftPerTon = Number(answers.bedding_coverage_sqft_per_ton) || 200;
    const polymericCoverageSqftPerBag = Number(answers.polymeric_coverage_sqft_per_bag) || 80;
    const geotextileCoverageSqftPerRoll = Number(answers.geotextile_coverage_sqft_per_roll) || 900;
    const borderBandWidthFt = Number(answers.border_band_width_ft) || 1;

    const lines: RawCalculatedLine[] = [];

    const borderAreaSqft = includeBorder ? perimeterFt * borderBandWidthFt : 0;
    const fieldAreaSqft = Math.max(areaSqft - borderAreaSqft, 0);

    lines.push({
      slotKey: "pavers",
      quantity: paver ? roundUpToOrderable(fieldAreaSqft, paver.specs) : ceilClean(fieldAreaSqft),
      unit: paver?.unit || "sq ft",
      catalogProduct: paver,
    });

    if (includeBorder) {
      lines.push({
        slotKey: "border_pavers",
        quantity: borderPaver
          ? roundUpToOrderable(borderAreaSqft, borderPaver.specs)
          : ceilClean(borderAreaSqft),
        unit: borderPaver?.unit || "sq ft",
        catalogProduct: borderPaver,
      });
    }

    lines.push({
      slotKey: "base_material",
      quantity: roundUpToHalfTon((areaSqft * baseDepthIn) / baseCoverageSqftPerTon),
      unit: "ton",
    });

    lines.push({
      slotKey: "bedding_sand",
      quantity: roundUpToHalfTon((areaSqft * beddingDepthIn) / beddingCoverageSqftPerTon),
      unit: "ton",
    });

    lines.push({
      slotKey: "geotextile_fabric",
      quantity: Math.ceil(areaSqft / geotextileCoverageSqftPerRoll),
      unit: "roll",
    });

    lines.push({ slotKey: "edge_restraint", quantity: Math.ceil(perimeterFt), unit: "ft" });

    lines.push({
      slotKey: "polymeric_sand",
      quantity: Math.ceil(areaSqft / polymericCoverageSqftPerBag),
      unit: "bag",
    });

    return lines;
  },
};

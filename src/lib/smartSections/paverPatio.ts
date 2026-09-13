import type { ProductCatalogItem } from "@/lib/api";
import { roundUpToOrderable } from "@/lib/catalogOrdering";
import type { AreaAndPerimeter, CalculatedLine, SmartSectionTemplate } from "./types";

const roundUpToHalfTon = (n: number) => Math.ceil(n * 2) / 2;

export const paverPatioTemplate: SmartSectionTemplate = {
  id: "paver_patio",
  label: "Paver Patio",
  lineItems: [
    "Pavers",
    "Border/Edge Pavers",
    "Base Material",
    "Bedding Sand",
    "Geotextile Fabric",
    "Edge Restraint",
    "Polymeric Sand",
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
    {
      key: "base_depth_in",
      label: "Base depth",
      type: "number",
      unit: "in",
      defaultValue: 5, // ASSUMPTION: midpoint of the suggested 4"-6" range
      step: "0.5",
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
    const baseDepthIn = Number(answers.base_depth_in) || 5;

    const lines: CalculatedLine[] = [];

    // Border band width: ASSUMPTION — 1 ft wide strip along the perimeter.
    // Real coverage depends on the specific border paver's width, which
    // this app doesn't track as a spec; flagged for verification.
    const borderAreaSqft = includeBorder ? perimeterFt * 1 : 0;
    const fieldAreaSqft = Math.max(areaSqft - borderAreaSqft, 0);

    lines.push({
      name: "Pavers",
      quantity: paver ? roundUpToOrderable(fieldAreaSqft, paver.specs) : Math.ceil(fieldAreaSqft),
      unit: paver?.unit || "sq ft",
      catalogProduct: paver,
    });

    if (includeBorder) {
      lines.push({
        name: "Border/Edge Pavers",
        quantity: borderPaver
          ? roundUpToOrderable(borderAreaSqft, borderPaver.specs)
          : Math.ceil(borderAreaSqft),
        unit: borderPaver?.unit || "sq ft",
        catalogProduct: borderPaver,
      });
    }

    // Base material: tons = area x depth / 165 (1 ton covers 33 sq ft at
    // 5" depth: 33 x 5 = 165) — verified live against a real 900 sq ft
    // example in an earlier pass of this feature. No separate waste
    // factor; the constant already bakes it in.
    lines.push({
      name: "Base Material",
      quantity: roundUpToHalfTon((areaSqft * baseDepthIn) / 165),
      unit: "ton",
    });

    // Bedding sand: fixed ~1" reference depth (not a question), coverage
    // ASSUMPTION — 200 sq ft/ton, varies by supplier.
    lines.push({
      name: "Bedding Sand",
      quantity: roundUpToHalfTon((areaSqft * 1) / 200),
      unit: "ton",
    });

    // Geotextile fabric: ASSUMPTION — 900 sq ft/roll (e.g. a 3'x300' roll).
    // Roll sizes vary enormously by supplier (some run 5,000+ sq ft) —
    // needs real verification before ordering.
    lines.push({
      name: "Geotextile Fabric",
      quantity: Math.ceil(areaSqft / 900),
      unit: "roll",
    });

    lines.push({
      name: "Edge Restraint",
      quantity: Math.ceil(perimeterFt),
      unit: "ft",
    });

    // Polymeric sand: ASSUMPTION — 80 sq ft/bag, varies by joint width/depth.
    lines.push({
      name: "Polymeric Sand",
      quantity: Math.ceil(areaSqft / 80),
      unit: "bag",
    });

    return lines;
  },
};

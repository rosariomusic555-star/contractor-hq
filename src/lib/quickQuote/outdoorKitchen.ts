import { pickedProduct, type QuickQuoteTemplate } from "./types";

export const outdoorKitchenQuickQuote: QuickQuoteTemplate = {
  id: "outdoor_kitchen",
  label: "Outdoor Kitchen",
  pricingUnit: "$ / linear ft",
  lineItemUnit: "lf",
  defaultRate: 450, // ASSUMPTION — real market rate varies widely by region
  questions: [
    // V1 scope: a single straight run only, same simplification as the
    // Materials Sheet's Outdoor Kitchen calculator.
    { key: "run_ft", label: "Total linear feet of run", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block / veneer product", type: "catalog_product", category: "Wall Block" },
  ],
  quantity: (answers) => Number(answers.run_ft) || 0,
  fallbackDescription: (answers) => {
    const runFt = Number(answers.run_ft) || 0;
    const product = pickedProduct(answers, "wall_block");
    const productPhrase = product ? ` using ${product.manufacturer} ${product.name}` : "";
    return `Construction of a ${runFt.toLocaleString()} linear ft outdoor kitchen${productPhrase}.`;
  },
};

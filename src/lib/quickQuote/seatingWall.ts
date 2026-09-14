import { pickedProduct, type QuickQuoteTemplate } from "./types";

export const seatingWallQuickQuote: QuickQuoteTemplate = {
  id: "seating_wall",
  label: "Seating Wall",
  pricingUnit: "$ / linear ft",
  lineItemUnit: "lf",
  defaultRate: 150, // ASSUMPTION — real market rate varies widely by region
  questions: [
    { key: "length_ft", label: "Linear feet of wall", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block product", type: "catalog_product", category: "Wall Block" },
  ],
  quantity: (answers) => Number(answers.length_ft) || 0,
  fallbackDescription: (answers) => {
    const lengthFt = Number(answers.length_ft) || 0;
    const product = pickedProduct(answers, "wall_block");
    const productPhrase = product ? ` using ${product.manufacturer} ${product.name}` : "";
    return `Construction of a ${lengthFt.toLocaleString()} linear ft seating wall${productPhrase}.`;
  },
};

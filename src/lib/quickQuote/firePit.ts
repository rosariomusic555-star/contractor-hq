import { pickedProduct, type QuickQuoteTemplate } from "./types";

/** Kept deliberately simple, consistent with the Materials Sheet
 * calculator's approach — no circumference/diameter geometry, just a
 * direct linear-foot input regardless of shape. */
export const firePitQuickQuote: QuickQuoteTemplate = {
  id: "fire_pit",
  label: "Fire Pit",
  pricingUnit: "$ / linear ft",
  lineItemUnit: "lf",
  defaultRate: 200, // ASSUMPTION — real market rate varies widely by region
  questions: [
    { key: "wall_length_ft", label: "Total linear feet of wall", type: "number", unit: "ft" },
    { key: "wall_block", label: "Wall block product", type: "catalog_product", category: "Wall Block" },
  ],
  quantity: (answers) => Number(answers.wall_length_ft) || 0,
  fallbackDescription: (answers) => {
    const wallLengthFt = Number(answers.wall_length_ft) || 0;
    const product = pickedProduct(answers, "wall_block");
    const productPhrase = product ? ` using ${product.manufacturer} ${product.name}` : "";
    return `Construction of a ${wallLengthFt.toLocaleString()} linear ft fire pit${productPhrase}.`;
  },
};

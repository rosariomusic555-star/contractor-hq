import { pickedProduct, type QuickQuoteTemplate } from "./types";

export const paverPatioQuickQuote: QuickQuoteTemplate = {
  id: "paver_patio",
  label: "Paver Patio",
  pricingUnit: "$ / sq ft",
  lineItemUnit: "sf",
  defaultRate: 25, // ASSUMPTION — real market rate varies widely by region
  questions: [
    { key: "area_sqft", label: "Patio size", type: "area" },
    { key: "paver", label: "Paver product", type: "catalog_product", category: "Pavers" },
  ],
  quantity: (answers) => Number(answers.area_sqft) || 0,
  fallbackDescription: (answers) => {
    const areaSqft = Number(answers.area_sqft) || 0;
    const product = pickedProduct(answers, "paver");
    const productPhrase = product ? ` using ${product.manufacturer} ${product.name}` : "";
    return `Installation of a ${areaSqft.toLocaleString()} sq ft paver patio${productPhrase}, including base preparation and edge restraint.`;
  },
};

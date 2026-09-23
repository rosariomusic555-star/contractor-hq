/**
 * Generate Order Sheet (0089/0090) — a printable/downloadable PDF built
 * from a chosen subset of a Materials Sheet's line items, for calling in
 * or emailing an order to a supplier. Pure data-prep lives here (tested);
 * the actual jsPDF rendering + file download is a thin, untested I/O
 * wrapper at the bottom, same "pure logic vs. side-effecting shell" split
 * as the rest of this app's lib modules.
 *
 * Two different shapes come out of the same selected items on purpose:
 *   - `resolveOrderLine()` → one row per ORIGINAL sheet line, never
 *     combined. This is what "Mark as ordered" persists (materialTracking.ts
 *     has no stored "ordered quantity" on a line — Ordered is always
 *     derived from material_order_items, so one order_item per real sheet
 *     line keeps that tracking accurate).
 *   - `combineOrderLines()` → the same rows merged for the SUPPLIER-FACING
 *     PDF only (identical product + unit summed into one line, per spec) —
 *     display-only, never written back to the database.
 */

import type { MaterialsItem, MaterialOrderUnit, PriceBookItem, ProductCatalogItem } from "./api";
import { wasteAdjustedOrderQuantity } from "./catalogOrdering";

/** Both an untagged line (category null) and the dropdown's own "Other"
 * catch-all land in the same bucket on a generated order sheet — a
 * supplier reading it sees no meaningful difference between the two. */
export const UNCATEGORIZED_LABEL = "Other / Uncategorized";

export function orderCategoryGroup(category: string | null | undefined): string {
  if (!category || category === "Other") return UNCATEGORIZED_LABEL;
  return category;
}

export interface ResolvedOrderLine {
  materialsItemId: string;
  category: string;
  /** Main description line — "{manufacturer} {product name}" for a
   * Catalog-linked item, else the line's own name as written. */
  title: string;
  /** Secondary line (finish/color, size, thickness) — Catalog items only,
   * null otherwise. Per spec: "manufacturer, product name, color, and
   * size/spec so the supplier can fill the order correctly." */
  detail: string | null;
  /** Waste-adjusted, rounded up to the orderable package quantity — see
   * wasteAdjustedOrderQuantity() (catalogOrdering.ts). */
  quantity: number;
  unit: string;
  /** The combining key for the PDF's display-only merge — same product +
   * same unit, never combining different colors/sizes/manual lines that
   * merely share a name. */
  groupKey: string;
}

/** Resolves ONE selected sheet line into its order-sheet shape. Never
 * combines — see the module doc comment for why "Mark as ordered" needs
 * one row per real line. */
export function resolveOrderLine(
  item: Pick<MaterialsItem, "id" | "name" | "quantity" | "unit" | "waste_percent" | "category" | "catalog_product_id" | "price_book_item_id">,
  catalogById: Map<string, ProductCatalogItem>,
  priceBookById: Map<string, PriceBookItem>,
): ResolvedOrderLine {
  const catalogProduct = item.catalog_product_id ? catalogById.get(item.catalog_product_id) : undefined;
  const priceBookItem = item.price_book_item_id ? priceBookById.get(item.price_book_item_id) : undefined;

  const quantity = wasteAdjustedOrderQuantity(Number(item.quantity), Number(item.waste_percent), catalogProduct?.specs);
  const unit = (catalogProduct?.unit ?? item.unit ?? "").trim() || "ea";

  let title = item.name;
  let detail: string | null = null;
  if (catalogProduct) {
    title = `${catalogProduct.manufacturer} ${catalogProduct.name}`.trim();
    const specs = catalogProduct.specs ?? {};
    const specParts = [specs.finish, specs.unit_sizes, specs.thickness].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    detail = specParts.length > 0 ? specParts.join(" · ") : null;
  }

  const category = orderCategoryGroup(item.category ?? catalogProduct?.category ?? priceBookItem?.category ?? null);

  const groupKey = item.catalog_product_id
    ? `catalog:${item.catalog_product_id}:${unit}`
    : item.price_book_item_id
      ? `pricebook:${item.price_book_item_id}:${unit}`
      : `name:${title.trim().toLowerCase()}:${unit}`;

  return { materialsItemId: item.id, category, title, detail, quantity, unit, groupKey };
}

export interface OrderSheetPdfLine {
  category: string;
  title: string;
  detail: string | null;
  quantity: number;
  unit: string;
}

/** Same product + same unit sums into one line for the PDF — never
 * different colors/sizes (they carry different groupKeys, see
 * resolveOrderLine), and never across a mismatched unit. */
export function combineOrderLines(lines: ResolvedOrderLine[]): OrderSheetPdfLine[] {
  const byKey = new Map<string, OrderSheetPdfLine>();
  for (const line of lines) {
    const existing = byKey.get(line.groupKey);
    if (existing) existing.quantity += line.quantity;
    else byKey.set(line.groupKey, { category: line.category, title: line.title, detail: line.detail, quantity: line.quantity, unit: line.unit });
  }
  return [...byKey.values()];
}

export interface OrderSheetGroup {
  category: string;
  lines: OrderSheetPdfLine[];
}

/** Groups the combined lines by category for the PDF, "Other /
 * Uncategorized" always last, everything else alphabetical. */
export function groupByCategory(lines: OrderSheetPdfLine[]): OrderSheetGroup[] {
  const byCategory = new Map<string, OrderSheetPdfLine[]>();
  for (const line of lines) {
    const list = byCategory.get(line.category);
    if (list) list.push(line);
    else byCategory.set(line.category, [line]);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([category, groupLines]) => ({ category, lines: groupLines }));
}

/** "Order Sheet - [Project Name] - [Supplier or date].pdf" — illegal
 * filename characters stripped, never guessed beyond what's given. */
export function orderSheetFilename(projectName: string, supplier: string | null, now: Date = new Date()): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();
  const supplierOrDate = supplier?.trim() || now.toISOString().slice(0, 10);
  return `Order Sheet - ${safe(projectName) || "Project"} - ${safe(supplierOrDate)}.pdf`;
}

// ---------------------------------------------------------------------------
// Mark as ordered — mapping a sheet line's free-text unit onto the
// constrained MaterialOrderUnit enum a material_order_item requires.
// Mirrors materialTracking.ts's own UNIT_ALIASES normalization groups, but
// resolves to the DB enum rather than a same-unit comparison — kept
// separate since the two serve different purposes (matching vs. writing).
// ---------------------------------------------------------------------------

const ORDER_UNIT_ALIASES: Record<string, MaterialOrderUnit> = {
  pallet: "pallet",
  pallets: "pallet",
  ton: "ton",
  tons: "ton",
  t: "ton",
  cy: "cubic_yard",
  cubic_yard: "cubic_yard",
  yd: "cubic_yard",
  yd3: "cubic_yard",
  yard: "cubic_yard",
  yards: "cubic_yard",
  bag: "bag",
  bags: "bag",
  lf: "linear_foot",
  linear_foot: "linear_foot",
  "linear foot": "linear_foot",
  "linear feet": "linear_foot",
  ea: "each",
  each: "each",
  pc: "each",
};

/** No exact match (e.g. "sf" — square feet has no equivalent in the fixed
 * 6-value delivery-unit vocabulary) falls back to "each"; the real unit
 * is never lost since it's still spelled out in the order line's own
 * description/quantity text. */
export function guessMaterialOrderUnit(freeTextUnit: string | null | undefined): MaterialOrderUnit {
  const key = (freeTextUnit ?? "").trim().toLowerCase();
  return ORDER_UNIT_ALIASES[key] ?? "each";
}

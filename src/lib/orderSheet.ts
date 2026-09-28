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

/** A line's category name: its material category (0094, by id — so a
 * rename in Settings shows here), else the old text snapshot. */
export function lineCategoryName(
  item: Pick<MaterialsItem, "category" | "material_category_id">,
  materialCategoryNameById?: Map<string, string>,
): string | null {
  const byId = item.material_category_id ? materialCategoryNameById?.get(item.material_category_id) : undefined;
  return byId ?? item.category ?? null;
}

const BULK_UNITS = new Set(["ton", "tons", "tn", "cu yd", "cy", "yd", "yd3"]);
const halfUp = (v: number) => (v > 0 ? Math.ceil(v * 2 - 1e-6) / 2 : 0);

/** A best guess at the order-sheet group from the line's name, for lines with
 * no category (Smart Section calculator lines never set one), matching the
 * default material categories. null = no confident guess → Uncategorized.
 * Order matters: "Backrest Caps" is Caps, "Border/Edge Pavers" is Pavers,
 * "Polymeric Sand" isn't bedding sand. */
export function guessOrderCategory(name: string | null | undefined): string | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (/\bcaps?\b/.test(n)) return "Caps";
  if (/paver/.test(n)) return "Pavers";
  if (/polymeric/.test(n)) return "Polymeric Sand";
  if (/\bsand\b/.test(n)) return "Bedding Sand";
  if (/wall block|veneer|concrete block|\bblock\b/.test(n)) return "Wall Block";
  if (/base material|\bbase\b|gravel|crushed stone|stone dust|interior fill/.test(n)) return "Base Gravel";
  if (/edge restraint|edging/.test(n)) return "Edging";
  if (/adhesive/.test(n)) return "Adhesive";
  if (/fabric|geotextile/.test(n)) return "Fabric";
  return null;
}

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
  item: Pick<
    MaterialsItem,
    "id" | "name" | "quantity" | "unit" | "waste_percent" | "category" | "catalog_product_id" | "price_book_item_id" | "color" | "material_category_id"
  >,
  catalogById: Map<string, ProductCatalogItem>,
  priceBookById: Map<string, PriceBookItem>,
  materialCategoryNameById?: Map<string, string>,
): ResolvedOrderLine {
  const catalogProduct = item.catalog_product_id ? catalogById.get(item.catalog_product_id) : undefined;
  const priceBookItem = item.price_book_item_id ? priceBookById.get(item.price_book_item_id) : undefined;

  const unit = (catalogProduct?.unit ?? item.unit ?? "").trim() || "ea";
  const quantity = BULK_UNITS.has(unit.toLowerCase()) && !catalogProduct?.specs
    ? // Aggregate / soil by the ton or yard: up to the next half, not the next whole (9.5 t stays 9.5).
      halfUp(Number(item.quantity) * (1 + (Number(item.waste_percent) || 0) / 100))
    : wasteAdjustedOrderQuantity(Number(item.quantity), Number(item.waste_percent), catalogProduct?.specs);

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
  // The line's color goes on the order too — and splits the grouping, so
  // two colors of the same product are ordered as separate lines.
  const color = item.color?.trim();
  if (color) title = `${title} — ${color}`;

  const category = orderCategoryGroup(
    lineCategoryName(item, materialCategoryNameById) ?? catalogProduct?.category ?? priceBookItem?.category ?? guessOrderCategory(item.name),
  );

  const groupKey = item.catalog_product_id
    ? `catalog:${item.catalog_product_id}:${color ?? ""}:${unit}`
    : item.price_book_item_id
      ? `pricebook:${item.price_book_item_id}:${color ?? ""}:${unit}`
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
  "cu yd": "cubic_yard",
  "cubic yard": "cubic_yard",
  "cubic yards": "cubic_yard",
  ft: "linear_foot",
  foot: "linear_foot",
  feet: "linear_foot",
  "lin ft": "linear_foot",
  sf: "square_foot",
  "sq ft": "square_foot",
  sqft: "square_foot",
  "square foot": "square_foot",
  "square feet": "square_foot",
  square_foot: "square_foot",
  roll: "roll",
  rolls: "roll",
  tube: "tube",
  tubes: "tube",
  layer: "layer",
  layers: "layer",
  ea: "each",
  each: "each",
  pc: "each",
  pcs: "each",
  piece: "each",
  pieces: "each",
};

/** Every unit the calculators and Cost plan write (sq ft, cu yd, ft, roll,
 * tube, layer… — delivery units widened in 0142) maps to its delivery unit,
 * so the Material Tracker can match the order to the line. Anything else
 * still falls back to "each". */
export function guessMaterialOrderUnit(freeTextUnit: string | null | undefined): MaterialOrderUnit {
  const key = (freeTextUnit ?? "").trim().toLowerCase();
  return ORDER_UNIT_ALIASES[key] ?? "each";
}

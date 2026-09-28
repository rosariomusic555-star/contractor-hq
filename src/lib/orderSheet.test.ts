import { describe, expect, it } from "vitest";
import type { MaterialsItem, PriceBookItem, ProductCatalogItem } from "./api";
import {
  UNCATEGORIZED_LABEL,
  combineOrderLines,
  groupByCategory,
  guessMaterialOrderUnit,
  orderCategoryGroup,
  lineCategoryName,
  orderSheetFilename,
  resolveOrderLine,
} from "./orderSheet";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function makeItem(overrides: Partial<MaterialsItem> = {}): MaterialsItem {
  return {
    id: nextId("mi"),
    section_id: "sec-1",
    name: "Item",
    quantity: 10,
    unit_cost: 5,
    sort_order: 0,
    expense_category_id: null,
    category: null,
    unit: "sf",
    price_book_item_id: null,
    catalog_product_id: null,
    waste_percent: 0,
    conversion_unit: null,
    conversion_factor: null,
    reconciled_at: null,
    disposition: null,
    return_credit: null,
    tracked: true,
    ...overrides,
  };
}

function makeCatalogProduct(overrides: Partial<ProductCatalogItem> = {}): ProductCatalogItem {
  return {
    id: nextId("cat"),
    manufacturer: "Techo-Bloc",
    category: "Pavers",
    name: "Blu 60 Smooth",
    sku: null,
    unit: "sq ft",
    specs: { coverage_per_unit: 1, units_per_package: 116.82, finish: "Smooth", unit_sizes: "6.5x13 in", thickness: "2 3/8 in (60mm)" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePriceBookItem(overrides: Partial<PriceBookItem> = {}): PriceBookItem {
  return {
    id: nextId("pb"),
    user_id: "user-1",
    name: "Bedding sand",
    unit: "cy",
    unit_price: 40,
    expense_category_id: null,
    material_type: null,
    category: "Bedding Sand",
    specs: {},
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("orderCategoryGroup", () => {
  it("groups null and 'Other' under the same catch-all label", () => {
    expect(orderCategoryGroup(null)).toBe(UNCATEGORIZED_LABEL);
    expect(orderCategoryGroup(undefined)).toBe(UNCATEGORIZED_LABEL);
    expect(orderCategoryGroup("Other")).toBe(UNCATEGORIZED_LABEL);
  });

  it("passes a real category through unchanged", () => {
    expect(orderCategoryGroup("Pavers")).toBe("Pavers");
  });
});

describe("resolveOrderLine", () => {
  it("uses the line's own name for a manual (unlinked) item", () => {
    const item = makeItem({ name: "Mystery mix", quantity: 5, waste_percent: 0, unit: "bag" });
    const line = resolveOrderLine(item, new Map(), new Map());
    expect(line.title).toBe("Mystery mix");
    expect(line.detail).toBeNull();
    expect(line.quantity).toBe(5);
    expect(line.unit).toBe("bag");
  });

  it("shows manufacturer + product name + finish/size/thickness for a Catalog-linked item", () => {
    const product = makeCatalogProduct({ id: "cat-1" });
    const item = makeItem({ catalog_product_id: "cat-1", quantity: 200, waste_percent: 0 });
    const line = resolveOrderLine(item, new Map([["cat-1", product]]), new Map());
    expect(line.title).toBe("Techo-Bloc Blu 60 Smooth");
    expect(line.detail).toBe("Smooth · 6.5x13 in · 2 3/8 in (60mm)");
  });

  it("applies waste and rounds up to the orderable package quantity for a Catalog-linked item", () => {
    const product = makeCatalogProduct({ id: "cat-1", specs: { coverage_per_unit: 1, units_per_package: 100 } });
    const item = makeItem({ catalog_product_id: "cat-1", quantity: 230, waste_percent: 10 }); // 230*1.1=253 -> 300
    const line = resolveOrderLine(item, new Map([["cat-1", product]]), new Map());
    expect(line.quantity).toBe(300);
  });

  it("resolves category from the line itself first, falling back to the linked Catalog/Price Book source", () => {
    const product = makeCatalogProduct({ id: "cat-1", category: "Pavers" });
    const withOwnCategory = resolveOrderLine(
      makeItem({ catalog_product_id: "cat-1", category: "Caps" }),
      new Map([["cat-1", product]]),
      new Map(),
    );
    expect(withOwnCategory.category).toBe("Caps");

    const inheritingFromCatalog = resolveOrderLine(
      makeItem({ catalog_product_id: "cat-1", category: null }),
      new Map([["cat-1", product]]),
      new Map(),
    );
    expect(inheritingFromCatalog.category).toBe("Pavers");

    const pb = makePriceBookItem({ id: "pb-1", category: "Bedding Sand" });
    const inheritingFromPriceBook = resolveOrderLine(
      makeItem({ price_book_item_id: "pb-1", category: null }),
      new Map(),
      new Map([["pb-1", pb]]),
    );
    expect(inheritingFromPriceBook.category).toBe("Bedding Sand");

    const untagged = resolveOrderLine(makeItem({ category: null }), new Map(), new Map());
    expect(untagged.category).toBe(UNCATEGORIZED_LABEL);
  });

  it("gives different colors/sizes of the same catalog product different group keys", () => {
    const smooth = makeCatalogProduct({ id: "cat-1" });
    const slate = makeCatalogProduct({ id: "cat-2", name: "Blu 60 Slate", specs: { ...smooth.specs, finish: "Slate" } });
    const a = resolveOrderLine(makeItem({ catalog_product_id: "cat-1" }), new Map([["cat-1", smooth]]), new Map());
    const b = resolveOrderLine(makeItem({ catalog_product_id: "cat-2" }), new Map([["cat-2", slate]]), new Map());
    expect(a.groupKey).not.toBe(b.groupKey);
  });
});

describe("combineOrderLines", () => {
  it("sums quantities for the same product + same unit across sections", () => {
    const product = makeCatalogProduct({ id: "cat-1" });
    const a = resolveOrderLine(makeItem({ catalog_product_id: "cat-1", quantity: 100, waste_percent: 0 }), new Map([["cat-1", product]]), new Map());
    const b = resolveOrderLine(makeItem({ catalog_product_id: "cat-1", quantity: 50, waste_percent: 0 }), new Map([["cat-1", product]]), new Map());
    const combined = combineOrderLines([a, b]);
    expect(combined).toHaveLength(1);
    expect(combined[0].quantity).toBe(a.quantity + b.quantity);
  });

  it("never combines two different manual lines that merely share a unit", () => {
    const a = resolveOrderLine(makeItem({ name: "Polymeric sand", unit: "bag" }), new Map(), new Map());
    const b = resolveOrderLine(makeItem({ name: "Adhesive", unit: "bag" }), new Map(), new Map());
    expect(combineOrderLines([a, b])).toHaveLength(2);
  });
});

describe("groupByCategory", () => {
  it("sorts categories alphabetically with Other / Uncategorized always last", () => {
    const lines = [
      { category: "Pavers", title: "A", detail: null, quantity: 1, unit: "ea" },
      { category: UNCATEGORIZED_LABEL, title: "B", detail: null, quantity: 1, unit: "ea" },
      { category: "Base Gravel", title: "C", detail: null, quantity: 1, unit: "ea" },
    ];
    expect(groupByCategory(lines).map((g) => g.category)).toEqual(["Base Gravel", "Pavers", UNCATEGORIZED_LABEL]);
  });
});

describe("orderSheetFilename", () => {
  it("uses the supplier when one is set", () => {
    expect(orderSheetFilename("Smith Patio", "ABC Supply")).toBe("Order Sheet - Smith Patio - ABC Supply.pdf");
  });

  it("falls back to today's date when there's no supplier", () => {
    const now = new Date("2026-09-23T12:00:00");
    expect(orderSheetFilename("Smith Patio", null, now)).toBe("Order Sheet - Smith Patio - 2026-09-23.pdf");
  });

  it("strips illegal filename characters", () => {
    expect(orderSheetFilename('Smith "Patio" / Backyard', "A:B")).toBe("Order Sheet - Smith Patio  Backyard - AB.pdf");
  });
});

describe("guessMaterialOrderUnit", () => {
  it("maps common free-text units to the constrained delivery-unit enum", () => {
    expect(guessMaterialOrderUnit("pallets")).toBe("pallet");
    expect(guessMaterialOrderUnit("ton")).toBe("ton");
    expect(guessMaterialOrderUnit("cy")).toBe("cubic_yard");
    expect(guessMaterialOrderUnit("bags")).toBe("bag");
    expect(guessMaterialOrderUnit("lf")).toBe("linear_foot");
  });

  it("square feet has its own delivery unit now (0142); anything unknown still falls back to 'each'", () => {
    expect(guessMaterialOrderUnit("sf")).toBe("square_foot");
    expect(guessMaterialOrderUnit("gallon")).toBe("each");
    expect(guessMaterialOrderUnit(null)).toBe("each");
  });
});

describe("lineCategoryName", () => {
  it("prefers the material category by id (so renames show), else the old text", () => {
    const names = new Map([["mc1", "Pavers (renamed)"]]);
    expect(lineCategoryName({ material_category_id: "mc1", category: "Pavers" }, names)).toBe("Pavers (renamed)");
    expect(lineCategoryName({ material_category_id: null, category: "Edging" }, names)).toBe("Edging");
    expect(lineCategoryName({ material_category_id: "gone", category: null }, names)).toBeNull();
  });
});

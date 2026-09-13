import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ProductCatalogItem } from "@/lib/api";

/** Fixed, code-level list so every brand shows even before it has any
 * products — otherwise brands with zero rows would silently vanish
 * instead of showing "No products yet." */
const CATALOG_BRANDS = ["Techo-Bloc", "Belgard", "Keystone", "Unilock", "Cambridge Pavers"];

type CatalogDrillLevel =
  | { level: "brands" }
  | { level: "categories"; brand: string }
  | { level: "products"; brand: string; category: string };

/**
 * Brand → Category → Product drill-down with search, browsable by brand
 * or by name/SKU. Shared by the materials item picker's Catalog tab and
 * Smart Section's calculator (catalog_product questions) — one
 * implementation, so both stay identical.
 */
export function CatalogPicker({
  catalogItems,
  category,
  onSelect,
}: {
  catalogItems: ProductCatalogItem[];
  /** Restrict browsing and search to this category only (e.g. "Wall
   * Block") — undefined shows every category. */
  category?: string;
  onSelect: (item: ProductCatalogItem) => void;
}) {
  const [filter, setFilter] = useState("");
  const [drill, setDrill] = useState<CatalogDrillLevel>({ level: "brands" });

  const items = category ? catalogItems.filter((p) => p.category === category) : catalogItems;

  const search = filter.trim().toLowerCase();
  const searchResults = search
    ? items.filter(
        (p) => p.name.toLowerCase().includes(search) || (p.sku ?? "").toLowerCase().includes(search),
      )
    : null;

  const categoriesForBrand = (brand: string) =>
    Array.from(new Set(items.filter((p) => p.manufacturer === brand).map((p) => p.category))).sort();

  const productsFor = (brand: string, cat: string) =>
    items.filter((p) => p.manufacturer === brand && p.category === cat);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search catalog by name or SKU…"
        autoFocus
      />

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {searchResults.map((p) => (
                <CatalogProductRow key={p.id} product={p} onSelect={onSelect} />
              ))}
            </div>
          )
        ) : drill.level === "brands" ? (
          <div className="divide-y divide-hairline">
            {CATALOG_BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setDrill({ level: "categories", brand })}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold text-foreground">{brand}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
              </button>
            ))}
          </div>
        ) : drill.level === "categories" ? (
          <div className="flex flex-col gap-2">
            <BackRow label={drill.brand} onClick={() => setDrill({ level: "brands" })} />
            {categoriesForBrand(drill.brand).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No {drill.brand} products yet{category ? ` in ${category}` : ""}.
              </p>
            ) : (
              <div className="divide-y divide-hairline">
                {categoriesForBrand(drill.brand).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setDrill({ level: "products", brand: drill.brand, category: cat })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="text-sm font-semibold text-foreground">{cat}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <BackRow
              label={drill.category}
              onClick={() => setDrill({ level: "categories", brand: drill.brand })}
            />
            <div className="divide-y divide-hairline">
              {productsFor(drill.brand, drill.category).map((p) => (
                <CatalogProductRow key={p.id} product={p} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 self-start text-xs font-bold text-primary hover:underline"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CatalogProductRow({
  product,
  onSelect,
}: {
  product: ProductCatalogItem;
  onSelect: (item: ProductCatalogItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{product.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {product.manufacturer} · {product.category}
          {product.sku ? ` · SKU ${product.sku}` : ""}
        </div>
      </div>
    </button>
  );
}

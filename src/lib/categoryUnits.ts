/**
 * Default unit per material category (0165) — Settings › Material
 * categories › Default unit. Setting a line's category fills in that
 * category's unit while the line's unit is still empty or still the old
 * category's default; a unit the contractor chose is never overwritten.
 */

/** The usual unit for a category, by its name — prefills a new category's
 * Default unit. Same rules as migration 0165's backfill (keep them in step).
 * Null = no usual unit (a broad category like Lighting or Other). */
export function suggestCategoryUnit(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  // Bulk materials: by the ton, or cu yd when the name says yards.
  if (/\b(gravel|aggregates?|crushed stone|bedding sand|top ?soil|mulch|paver base|screenings|stone dust)\b/.test(n)) {
    return /\b(yards?|yds?|cu\.? ?yd)\b/.test(n) ? "cu yd" : "ton";
  }
  if (/\b(polymeric sand|poly sand|mortar|concrete mix)\b/.test(n)) return "bag";
  if (/\b(veneers?|sod)\b/.test(n)) return "sq ft";
  if (/\bpavers?\b/.test(n)) return "sq ft";
  if (/\b(wall ?blocks?|caps?|coping|steps?|treads?|light fixtures?|fixtures?|transformers?)\b/.test(n)) return "piece";
  if (/\b(geotextile|fabric)\b/.test(n)) return "roll";
  if (/\b(edge restraints?|edging|drain pipe|pipe|wire)\b/.test(n)) return "ft";
  if (/\badhesives?\b/.test(n)) return "tube";
  return null;
}

type CategoryLike = { id: string; default_unit?: string | null };

/** A category's default unit, or null (none set / no category). */
export function categoryDefaultUnit(categories: CategoryLike[], id: string | null | undefined): string | null {
  if (!id) return null;
  return categories.find((c) => c.id === id)?.default_unit?.trim() || null;
}

type LineLike = {
  cost_type?: string;
  material_category_id: string | null;
  unit: string;
  catalog_product_id?: string | null;
};

/**
 * `next` with its unit set to its category's default when the category
 * was just set (or the line is new) and the unit is still empty or still
 * the previous category's default. Left alone when the same edit set the
 * unit itself (a Catalog / Price Book pick with a unit, the calculator).
 */
export function withCategoryUnit<T extends LineLike>(prev: T | undefined, next: T, categories: CategoryLike[]): T {
  if ((next.cost_type ?? "material") !== "material") return next;
  if (prev && prev.material_category_id === next.material_category_id) return next;
  const unit = categoryDefaultUnit(categories, next.material_category_id);
  if (!unit) return next;
  const current = next.unit.trim();
  if (!current) return { ...next, unit };
  if (!prev) return next;
  // The same edit brought its own unit.
  if (next.unit !== prev.unit) return next;
  if (next.catalog_product_id && next.catalog_product_id !== prev.catalog_product_id) return next;
  const previousDefault = categoryDefaultUnit(categories, prev.material_category_id);
  return previousDefault && current === previousDefault ? { ...next, unit } : next;
}

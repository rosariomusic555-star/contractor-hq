import { sumSectionTotals, type CostSection } from "./costPlanMath";

/**
 * Quote section ↔ materials sheet section links (0095) — which materials
 * sheet sections a quote section's price is compared against, and the
 * resulting per-section cost / profit / margin.
 *
 * "auto" mode is matched live, every render, against the quote's CURRENT
 * sheet sections — so it can't go stale when either side changes. "manual"
 * picks are filtered to sections that still exist on the current sheet;
 * anything else (deleted, or on a sheet the quote is no longer linked to)
 * simply drops out and is pruned on the next save.
 *
 * The quote's overall Estimated Cost is NOT built from these — it stays
 * the whole linked sheet (materialsCogs), unchanged.
 */

export interface QuoteSectionLike {
  name: string;
  job_category_id?: string | null;
  materials_link_mode?: "auto" | "manual";
}

export interface SheetSectionLike extends CostSection {
  id: string;
  name: string;
  job_category_id?: string | null;
  materials_items: NonNullable<CostSection["materials_items"]>;
}

const normName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** Auto-match: same project type, else the same name (case/space-insensitive). */
export function autoMatchedSheetSections<S extends SheetSectionLike>(quoteSection: QuoteSectionLike, sheetSections: S[]): S[] {
  if (quoteSection.job_category_id) {
    const byType = sheetSections.filter((s) => s.job_category_id === quoteSection.job_category_id);
    if (byType.length) return byType;
  }
  const name = normName(quoteSection.name);
  return name ? sheetSections.filter((s) => normName(s.name) === name) : [];
}

/** The sheet sections a quote section is linked to right now. */
export function linkedSheetSections<S extends SheetSectionLike>(
  quoteSection: QuoteSectionLike,
  manualIds: string[],
  sheetSections: S[],
): S[] {
  if (quoteSection.materials_link_mode === "manual") {
    const ids = new Set(manualIds);
    return sheetSections.filter((s) => ids.has(s.id));
  }
  return autoMatchedSheetSections(quoteSection, sheetSections);
}

/** The linked cost plan sections' full cost — every line type + labor
 * (costPlanMath), what the quote section chip and margin compare against. */
export function sheetSectionsCost(sections: SheetSectionLike[]): number {
  return sumSectionTotals(sections).total;
}

/** Section profit and margin % against the quote section's own price.
 * Null margin when the section has no price to compare against. */
export function sectionMargin(price: number, materialsCost: number): { profit: number; marginPct: number | null } {
  const profit = price - materialsCost;
  return { profit, marginPct: price > 0 ? (profit / price) * 100 : null };
}

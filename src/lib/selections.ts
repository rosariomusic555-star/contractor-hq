/**
 * Client Selections (0115) — the one place the selection math lives, for
 * both shapes: the contractor's rows (quote_selection_groups with options
 * and picks) and the client-facing serializer's (`selections` on a
 * section). Mirrors selection_group_price / quote_committed_total in SQL:
 *
 *   group price    frozen approved_price once approved; else the picked
 *                  options' price adjustments; else the default option(s)
 *   section adds   Σ group prices — only when the section is included
 *                  (required, or an optional section the client kept)
 */

export interface SelectionOptionLike {
  id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  /** Contractor rows only — never on the client shape. */
  cost_delta?: number;
}

export interface SelectionGroupLike {
  id: string;
  name: string;
  required: boolean;
  multi: boolean;
  approved_price?: number | null;
  options: SelectionOptionLike[];
  /** Picked option ids. */
  picked: string[];
}

/** Contractor rows → the common shape. */
export function groupFromRows(g: {
  id: string;
  name: string;
  required: boolean;
  multi: boolean;
  approved_price?: number | null;
  quote_selection_options?: { id: string; name: string; price_delta: number; is_default: boolean; cost_delta?: number; sort_order?: number }[];
  quote_selection_picks?: { option_id: string }[];
}): SelectionGroupLike {
  return {
    id: g.id,
    name: g.name,
    required: g.required,
    multi: g.multi,
    approved_price: g.approved_price ?? null,
    options: [...(g.quote_selection_options ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((o) => ({ id: o.id, name: o.name, price_delta: Number(o.price_delta) || 0, is_default: !!o.is_default, cost_delta: Number(o.cost_delta) || 0 })),
    picked: (g.quote_selection_picks ?? []).map((p) => p.option_id),
  };
}

/** The options that count right now: picks, else defaults. */
export function effectiveOptions(g: SelectionGroupLike, picked: string[] = g.picked): SelectionOptionLike[] {
  const ids = picked.length ? picked : g.options.filter((o) => o.is_default).map((o) => o.id);
  return g.options.filter((o) => ids.includes(o.id));
}

export function groupPrice(g: SelectionGroupLike, picked?: string[]): number {
  if (g.approved_price != null && picked === undefined) return Number(g.approved_price);
  return effectiveOptions(g, picked).reduce((s, o) => s + o.price_delta, 0);
}

export function groupCost(g: SelectionGroupLike, picked?: string[]): number {
  return effectiveOptions(g, picked).reduce((s, o) => s + (o.cost_delta ?? 0), 0);
}

export function selectionsTotal(groups: SelectionGroupLike[], pickedOverride?: Record<string, string[]>): number {
  return groups.reduce((s, g) => s + groupPrice(g, pickedOverride?.[g.id]), 0);
}

/** Lowest / highest the section's selections can add (single choice: the
 * cheapest / dearest option; multi: nothing / everything positive). */
export function selectionRange(groups: SelectionGroupLike[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const g of groups) {
    const prices = g.options.map((o) => o.price_delta);
    if (!prices.length) continue;
    if (g.multi) {
      // Any combination: cheapest = every discount (plus the cheapest
      // option when one is required and nothing is free); dearest = every
      // surcharge.
      min += prices.filter((p) => p < 0).reduce((a, b) => a + b, 0);
      if (g.required && prices.every((p) => p > 0)) min += Math.min(...prices);
      max += prices.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    } else {
      min += g.required ? Math.min(...prices) : Math.min(0, ...prices);
      max += g.required ? Math.max(...prices) : Math.max(0, ...prices);
    }
  }
  return { min, max };
}

/** Required groups with nothing picked and no default. */
export function missingRequired(groups: SelectionGroupLike[], pickedOverride?: Record<string, string[]>): SelectionGroupLike[] {
  return groups.filter((g) => g.required && effectiveOptions(g, pickedOverride?.[g.id] ?? g.picked).length === 0);
}

/** "Included" / "+$1,250" / "−$200" */
export function priceLabel(delta: number): string {
  if (!delta) return "Included";
  const v = Math.abs(delta).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(delta) % 1 ? 2 : 0 });
  return `${delta > 0 ? "+" : "−"}${v}`;
}

/** Margin impact of an option (internal): price − cost adjustment. */
export const optionMarginImpact = (o: SelectionOptionLike) => o.price_delta - (o.cost_delta ?? 0);

/** Whether a quote section counts toward the total (same rule as SQL
 * quote_section_included). */
export function sectionIncluded(section: { is_optional: boolean; quote_items?: { client_selected: boolean }[]; items?: { client_selected: boolean }[] }): boolean {
  if (!section.is_optional) return true;
  return (section.quote_items ?? section.items ?? []).some((i) => i.client_selected);
}

// ---------------------------------------------------------------------------
// Client shape (the serializer's `selections` on a section)
// ---------------------------------------------------------------------------

export interface ClientSelectionGroupShape {
  id: string;
  name: string;
  required: boolean;
  multi: boolean;
  options: { id: string; name: string; price_delta: number; is_default: boolean }[];
  picked: string[];
}

export const clientGroupLike = (g: ClientSelectionGroupShape): SelectionGroupLike => ({
  id: g.id,
  name: g.name,
  required: g.required,
  multi: g.multi,
  options: g.options.map((o) => ({ id: o.id, name: o.name, price_delta: Number(o.price_delta) || 0, is_default: !!o.is_default })),
  picked: g.picked ?? [],
});

/** A client-facing quote's live total: included items + selections, with
 * the client's in-progress picks (by group id) overriding the saved ones. */
export function clientQuoteTotal(
  sections: { is_optional: boolean; items: { price: number; quantity: number; is_optional: boolean; client_selected: boolean }[]; selections?: ClientSelectionGroupShape[] }[],
  picks: Record<string, string[]> = {},
): number {
  let total = 0;
  for (const s of sections) {
    for (const i of s.items) if (!(s.is_optional || i.is_optional) || i.client_selected) total += Number(i.price) * Number(i.quantity ?? 1);
    if (s.selections?.length && sectionIncluded(s)) {
      for (const g of s.selections) {
        const like = clientGroupLike(g);
        total += groupPrice(like, picks[g.id] ?? like.picked);
      }
    }
  }
  return total;
}

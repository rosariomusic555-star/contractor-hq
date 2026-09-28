/**
 * The client's optional-item choices on the share-link quote page
 * (/quote/:token). They're SAVED (quote_items.client_selected via the
 * set_quote_item_selection RPC) — signing, the contract value and the Won
 * deposit invoice all read the saved choice (quote_committed_total /
 * quoteTotal), so what the client sees is what they sign. Pure helpers.
 */

interface SectionLike {
  id: string;
  is_optional: boolean;
  items: { id: string; is_optional: boolean; client_selected: boolean }[];
}

/** The page's starting state, from what's saved: an optional section is
 * checked when any of its items is (sectionIncluded), an optional item when it is. */
export function seedOptionalSelection(sections: SectionLike[]): { sections: Record<string, boolean>; items: Record<string, boolean> } {
  const out = { sections: {} as Record<string, boolean>, items: {} as Record<string, boolean> };
  for (const s of sections) {
    if (s.is_optional) out.sections[s.id] = s.items.some((i) => i.client_selected);
    for (const i of s.items) if (s.is_optional || i.is_optional) out.items[i.id] = i.client_selected;
  }
  return out;
}

/** What to save when the client toggles: a whole optional section writes
 * every item in it; an optional item writes itself. */
export function selectionWrites(section: SectionLike, target: { kind: "section" } | { kind: "item"; itemId: string }, selected: boolean): { itemId: string; selected: boolean }[] {
  if (target.kind === "section") return section.is_optional ? section.items.map((i) => ({ itemId: i.id, selected })) : [];
  const item = section.items.find((i) => i.id === target.itemId);
  return item && (section.is_optional || item.is_optional) ? [{ itemId: item.id, selected }] : [];
}

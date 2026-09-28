/**
 * After a save that failed partway, the rows it DID create must stop looking
 * new — otherwise saving again creates them a second time (doubling their
 * cost). Swaps each created row's temporary draft id for its real id.
 */
export function remapDraftIds<I extends { id: string }, S extends { id: string; items: I[] }>(draft: S[], created: Map<string, string>): S[] {
  if (created.size === 0) return draft;
  return draft.map((s) => ({
    ...s,
    id: created.get(s.id) ?? s.id,
    items: s.items.map((i) => (created.has(i.id) ? { ...i, id: created.get(i.id)! } : i)),
  }));
}

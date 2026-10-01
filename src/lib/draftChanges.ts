/**
 * How much of a draft differs from what's saved — the save bar's "3 unsaved
 * changes" and the accent edge on edited sections/cards. Pure.
 *
 * Top-level fields count one each; a list of rows with ids (sections) counts
 * each added, removed or edited row, and its ids come back so the screen can
 * highlight them. Nested lists inside a row (a section's items) just make
 * that row "edited".
 */
export interface DraftChanges {
  count: number;
  /** Ids of rows (at any listed level) that are new or edited. */
  changedIds: Set<string>;
}

type Rec = Record<string, unknown>;
const isRowList = (v: unknown): v is Rec[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && typeof (x as Rec).id === "string");

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffRows(draft: Rec[], base: Rec[], out: DraftChanges) {
  const baseById = new Map(base.map((r) => [r.id as string, r]));
  const draftIds = new Set(draft.map((r) => r.id as string));
  for (const r of draft) {
    const b = baseById.get(r.id as string);
    if (!b || !same(r, b)) {
      out.count++;
      out.changedIds.add(r.id as string);
    }
  }
  for (const id of baseById.keys()) if (!draftIds.has(id)) out.count++;
  // Same rows, new order: one change.
  const kept = draft.map((r) => r.id as string).filter((id) => baseById.has(id));
  const baseOrder = base.map((r) => r.id as string).filter((id) => draftIds.has(id));
  if (kept.length === baseOrder.length && kept.some((id, i) => id !== baseOrder[i]) && out.count === 0) out.count++;
}

export function draftChanges(draft: unknown, base: unknown): DraftChanges {
  const out: DraftChanges = { count: 0, changedIds: new Set() };
  if (base == null) return out;
  if (isRowList(draft) || isRowList(base)) {
    diffRows((draft as Rec[]) ?? [], (base as Rec[]) ?? [], out);
    return out;
  }
  if (draft && typeof draft === "object" && base && typeof base === "object") {
    const keys = new Set([...Object.keys(draft as Rec), ...Object.keys(base as Rec)]);
    for (const k of keys) {
      const d = (draft as Rec)[k];
      const b = (base as Rec)[k];
      if (isRowList(d) || isRowList(b)) diffRows((d as Rec[]) ?? [], (b as Rec[]) ?? [], out);
      else if (!same(d, b)) out.count++;
    }
    return out;
  }
  if (!same(draft, base)) out.count++;
  return out;
}

/** The thin accent edge on an edited-but-unsaved section or card. */
export const EDITED_CLASS = "ring-2 ring-warning/70 ring-offset-2 ring-offset-background";

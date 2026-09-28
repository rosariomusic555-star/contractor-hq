/**
 * Feature sections sit together by type: Seating Wall 1, Seating Wall 2,
 * then Fire Pit 1, Fire Pit 2 — in the Cost plan and in a quote's starting
 * sections. `key` is a section's feature type (its feature's Job Category
 * id); null = not a feature section (a custom section, General), which
 * keeps its place. Pure helpers — the same rules as migration 0135.
 */

type KeyOf<T> = (item: T) => string | null;

/** Stable grouping: each type's items move up to directly follow the first
 * one of that type; everything else keeps its relative order. */
export function groupByType<T>(items: T[], keyOf: KeyOf<T>): T[] {
  const out: T[] = [];
  const done = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) out.push(item);
    else if (!done.has(key)) {
      done.add(key);
      out.push(...items.filter((x) => keyOf(x) === key));
    }
  }
  return out;
}

/** Where a new section of type `key` goes: right after the last section of
 * that type, else just above General (`isPinnedLast`), else at the end. */
export function insertIndexForType<T>(items: T[], key: string | null, keyOf: KeyOf<T>, isPinnedLast: (item: T) => boolean = () => false): number {
  if (key != null) {
    for (let i = items.length - 1; i >= 0; i--) if (keyOf(items[i]) === key) return i + 1;
  }
  const pinned = items.findIndex(isPinnedLast);
  return pinned === -1 ? items.length : pinned;
}

/**
 * Existing plans/quotes: the grouped order — or null when they're already
 * grouped, or when the out-of-place sections don't look like the old
 * "appended at the bottom" behaviour (then someone arranged them by hand and
 * they're left alone). The old behaviour only ever appended feature sections
 * at the end, so: from the first section that breaks grouping onward,
 * everything must be a feature section.
 */
export function regroupIfAutoAppended<T>(items: T[], keyOf: KeyOf<T>, isPinnedLast: (item: T) => boolean = () => false): T[] | null {
  const body = items.filter((x) => !isPinnedLast(x));
  const pinned = items.filter(isPinnedLast);
  const seen = new Set<string>();
  let breakAt = -1;
  for (let i = 0; i < body.length; i++) {
    const key = keyOf(body[i]);
    if (key == null) continue;
    if (seen.has(key) && keyOf(body[i - 1]) !== key) {
      breakAt = i;
      break;
    }
    seen.add(key);
  }
  if (breakAt === -1) return null;
  if (body.slice(breakAt).some((x) => keyOf(x) == null)) return null;
  return [...groupByType(body, keyOf), ...pinned];
}

import { useEffect, useState } from "react";

const STORAGE_KEY = "chq_section_collapse_v1";

/** What's persisted: ids the user collapsed, and — only for callers with a
 * `defaultCollapsed` — ids the user explicitly expanded (so a default of
 * "collapsed" can be overridden and remembered). The legacy value is a
 * bare array of collapsed ids; it still reads as { collapsed, expanded: [] }. */
interface Stored {
  collapsed: Set<string>;
  expanded: Set<string>;
}

function read(key: string): Stored {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return { collapsed: new Set(parsed), expanded: new Set() };
    return { collapsed: new Set(parsed?.c ?? []), expanded: new Set(parsed?.e ?? []) };
  } catch {
    return { collapsed: new Set(), expanded: new Set() };
  }
}

function write(key: string, s: Stored, legacyFormat: boolean) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(legacyFormat ? [...s.collapsed] : { c: [...s.collapsed], e: [...s.expanded] }),
    );
  } catch {
    // best-effort — a full/blocked localStorage just means it won't persist
  }
}

/**
 * Per-section collapse/expand state — pure UI state persisted in
 * localStorage, deliberately never written to the record itself and never
 * counted as an unsaved change (no draft/dirty/save interaction at all).
 *
 * Used by the Quote / Materials Sheet / Change Order builders' section cards
 * (see SectionCard, src/components/common) with no options: section ids
 * are globally-unique uuids, one flat set, and an id absent from it reads as
 * expanded, so new sections always start expanded.
 *
 * Options (used by the Measurements card):
 *  - `storageKey` — a separate store, e.g. namespaced per user.
 *  - `defaultCollapsed(id)` — the state for an id the user never toggled
 *    (e.g. "collapsed if it already has data"). The user's explicit choice
 *    in either direction always wins and is remembered.
 */
export function useSectionCollapse(opts: { storageKey?: string; defaultCollapsed?: (id: string) => boolean } = {}) {
  const key = opts.storageKey ?? STORAGE_KEY;
  const legacyFormat = !opts.defaultCollapsed;
  const [state, setState] = useState<Stored>(() => read(key));
  // Re-read when the key changes (e.g. the signed-in user resolves).
  const [loadedKey, setLoadedKey] = useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState(read(key));
  }

  // Another tab changed the same store — pick it up.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setState(read(key));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const isCollapsed = (id: string) =>
    state.collapsed.has(id) ? true : state.expanded.has(id) ? false : (opts.defaultCollapsed?.(id) ?? false);

  const persist = (next: Stored) => {
    setState(next);
    write(key, next, legacyFormat);
  };

  const setMany = (ids: string[], collapsed: boolean) => {
    // Apply the change on top of what's stored *now*, not this tab's
    // snapshot, so two open tabs never wipe each other's choices.
    const base = read(key);
    const c = base.collapsed;
    const e = base.expanded;
    for (const id of ids) {
      if (collapsed) {
        c.add(id);
        e.delete(id);
      } else {
        c.delete(id);
        // Only remember an explicit "expanded" when there's a default it overrides.
        if (!legacyFormat) e.add(id);
      }
    }
    persist({ collapsed: c, expanded: e });
  };

  const toggle = (id: string) => setMany([id], !isCollapsed(id));

  /** Force-expands one section — e.g. to reveal a drop target while
   * dragging an item over it, or a just-added section. */
  const expand = (id: string) => {
    if (isCollapsed(id)) setMany([id], false);
  };

  return {
    isCollapsed,
    toggle,
    expand,
    collapseAll: (ids: string[]) => setMany(ids, true),
    expandAll: (ids: string[]) => setMany(ids, false),
  };
}

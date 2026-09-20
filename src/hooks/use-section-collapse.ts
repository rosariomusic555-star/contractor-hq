import { useState } from "react";

const STORAGE_KEY = "chq_section_collapse_v1";

/** Section ids are already globally-unique uuids (or client-generated
 * tmp-ids), so one flat set works across every quote/materials sheet ever
 * opened — no per-document namespacing needed. */
function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort — a full/blocked localStorage just means it won't persist
  }
}

/**
 * Per-section collapse/expand state for the Quote and Materials Sheet
 * builders' section cards (see SectionCard, src/components/common) —
 * pure UI state persisted in localStorage, deliberately never written to
 * the quote/sheet record itself and never counted as an unsaved change
 * (no draft/dirty/save interaction at all). A section id absent from the
 * stored set reads as expanded, so new sections always start expanded.
 */
export function useSectionCollapse() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const persist = (next: Set<string>) => {
    setCollapsed(next);
    writeCollapsed(next);
  };

  const toggle = (sectionId: string) => {
    const next = new Set(collapsed);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    persist(next);
  };

  /** Force-expands one section — e.g. to reveal a drop target while
   * dragging an item over it, or (future) to surface a validation error
   * instead of hiding it inside a collapsed section. */
  const expand = (sectionId: string) => {
    if (!collapsed.has(sectionId)) return;
    const next = new Set(collapsed);
    next.delete(sectionId);
    persist(next);
  };

  const collapseAll = (sectionIds: string[]) => persist(new Set([...collapsed, ...sectionIds]));
  const expandAll = (sectionIds: string[]) => {
    const ids = new Set(sectionIds);
    persist(new Set([...collapsed].filter((id) => !ids.has(id))));
  };

  return {
    isCollapsed: (sectionId: string) => collapsed.has(sectionId),
    toggle,
    expand,
    collapseAll,
    expandAll,
  };
}

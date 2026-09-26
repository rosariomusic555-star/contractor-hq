import { createContext, useContext, useEffect, useId, useRef } from "react";

/** One editor's live state, read by the app-wide guard. */
export interface UnsavedEntry {
  dirty: boolean;
  saving: boolean;
  save: () => void;
  discard: () => void;
}

export interface UnsavedChangesRegistry {
  register: (id: string, get: () => UnsavedEntry) => () => void;
  /** Something about an entry changed (dirty / saving). */
  notify: () => void;
}

export const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

/**
 * Warns before leaving a page with unsaved edits — the one hook every
 * "Unsaved changes · Discard · Save changes" screen uses (DraftSaveBar calls
 * it, so every page with that bar is covered). Pass the same dirty flag that
 * shows the bar, its save / discard, and whether a save is in flight.
 *
 *   - leaving inside the app (links, sidebar, back / forward, swipe-back):
 *     UnsavedChangesProvider asks "Save changes before leaving?"
 *   - closing the tab, refreshing, typing a URL: the browser's own prompt
 *
 * Never blocks while clean, or while saving — so a save that navigates on
 * success (a new quote opening its page) goes straight through.
 */
export function useUnsavedChangesGuard(isDirty: boolean, onSave: () => void, onDiscard: () => void, saving = false) {
  const registry = useContext(UnsavedChangesContext);
  const id = useId();
  const latest = useRef<UnsavedEntry>({ dirty: isDirty, saving, save: onSave, discard: onDiscard });
  latest.current = { dirty: isDirty, saving, save: onSave, discard: onDiscard };

  useEffect(() => registry?.register(id, () => latest.current), [registry, id]);
  useEffect(() => {
    registry?.notify();
  }, [registry, isDirty, saving]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}

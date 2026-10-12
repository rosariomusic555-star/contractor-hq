import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GlobalSearchContext } from "./search-context";
import { MobileSearchSheet } from "./MobileSearchSheet";

/** Typing in a field? Then "/" is just a character. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[role=textbox]");
}

/**
 * Global search for the owner shell (AppLayout). ⌘K / Ctrl+K, or "/" when
 * not typing in a field, focus the sidebar search box; where there's no
 * sidebar (phones) they — and the header search buttons — open the
 * full-screen search page instead.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sidebarFocus = useRef<(() => boolean) | null>(null);
  // iOS only raises the keyboard for a focus() made during the tap itself;
  // focusing this stand-in synchronously keeps it up while the page opens
  // and moves focus to its real input.
  const keyboardProxy = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    if (sidebarFocus.current?.()) return;
    keyboardProxy.current?.focus();
    setSheetOpen(true);
  }, []);
  const registerSidebarInput = useCallback((focus: (() => boolean) | null) => {
    sidebarFocus.current = focus;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target) && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  const value = useMemo(() => ({ openSearch, registerSidebarInput }), [openSearch, registerSidebarInput]);

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <input ref={keyboardProxy} aria-hidden tabIndex={-1} className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" style={{ fontSize: 16 }} />
      <MobileSearchSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </GlobalSearchContext.Provider>
  );
}

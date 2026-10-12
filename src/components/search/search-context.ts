import { createContext, useContext } from "react";

export interface GlobalSearchContextValue {
  /** Focus the sidebar search box (desktop) or open the phone search page. */
  openSearch: () => void;
  /** SidebarSearch registers its focus function here; it returns false while
   *  the box isn't visible (phones), so openSearch falls back to the page. */
  registerSidebarInput: (focus: (() => boolean) | null) => void;
}

export const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

/** The app shell's search (owner layout only) — null outside it, so shared
 *  pieces like MobilePageHeader only show a search button where it works. */
export function useGlobalSearch(): GlobalSearchContextValue | null {
  return useContext(GlobalSearchContext);
}

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. */
export function searchShortcutLabel(): string {
  const p = typeof navigator === "undefined" ? "" : (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(p) ? "⌘K" : "Ctrl K";
}

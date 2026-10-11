import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CreateOpportunityDialog } from "@/components/common/CreateOpportunityDialog";
import { GlobalSearchContext } from "./search-context";
import { GlobalSearchDialog } from "./GlobalSearchDialog";

/** Typing in a field? Then "/" is just a character. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[role=textbox]");
}

/**
 * Global search for the owner shell (AppLayout): the dialog, plus the
 * shortcuts that open it from anywhere — ⌘K / Ctrl+K, or "/" when not
 * typing in a field.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target) && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalSearchDialog open={open} onOpenChange={setOpen} onNewOpportunity={() => setOppOpen(true)} />
      <CreateOpportunityDialog open={oppOpen} onOpenChange={setOppOpen} />
    </GlobalSearchContext.Provider>
  );
}

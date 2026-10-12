import { Search } from "lucide-react";
import { searchShortcutLabel, useGlobalSearch } from "./search-context";

/** The sidebar's search box — a button that opens the search dialog. */
export function SidebarSearch() {
  const search = useGlobalSearch();
  if (!search) return null;
  const shortcut = searchShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => search.setOpen(true)}
      aria-label={`Search (${shortcut})`}
      aria-keyshortcuts={shortcut === "⌘K" ? "Meta+K" : "Control+K"}
      className="flex h-[38px] w-full items-center gap-[10px] rounded-[10px] bg-muted px-[11px] text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="h-4 w-4 flex-none" aria-hidden />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border border-border bg-card px-1.5 py-px font-sans text-[11px] font-medium text-muted-foreground">{shortcut}</kbd>
    </button>
  );
}

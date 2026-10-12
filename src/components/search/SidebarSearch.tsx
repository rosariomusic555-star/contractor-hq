import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchShortcutLabel, useGlobalSearch } from "./search-context";

/** The sidebar's search box — a button that opens the search dialog.
 *  `onSlate`: translucent white field for the slate sidebar header (solid
 *  white with dark text while focused). */
export function SidebarSearch({ onSlate = false }: { onSlate?: boolean }) {
  const search = useGlobalSearch();
  if (!search) return null;
  const shortcut = searchShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => search.setOpen(true)}
      aria-label={`Search (${shortcut})`}
      aria-keyshortcuts={shortcut === "⌘K" ? "Meta+K" : "Control+K"}
      className={cn(
        "group flex h-[38px] w-full items-center gap-[10px] rounded-[10px] px-[11px] text-sm transition-colors focus-visible:outline-none",
        onSlate
          ? "border border-white/20 bg-white/15 text-white/70 hover:bg-white/20 hover:text-white focus-visible:border-white focus-visible:bg-white focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-white/50"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Search className="h-4 w-4 flex-none" aria-hidden />
      <span className="flex-1 text-left">Search…</span>
      <kbd
        className={cn(
          "rounded px-1.5 py-px font-sans text-[11px] font-medium",
          onSlate ? "bg-white/15 text-white/80 group-focus-visible:bg-muted group-focus-visible:text-muted-foreground" : "border border-border bg-card text-muted-foreground",
        )}
      >
        {shortcut}
      </kbd>
    </button>
  );
}

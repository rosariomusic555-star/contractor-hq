import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/** Toolbar toggle: a section's line items as compact rows (still sortable
 * and draggable) or full rows. Header + toolbar stay either way. */
export function ItemsCollapseToggle({ collapsed, onToggle, count }: { collapsed: boolean; onToggle: () => void; count: number }) {
  if (count === 0) return null;
  const Icon = collapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={collapsed}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {collapsed ? "Expand items" : "Collapse items"}
    </button>
  );
}

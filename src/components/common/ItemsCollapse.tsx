import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/** Toolbar toggle: collapse just a section's line items (header + toolbar stay). */
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
      {collapsed ? "Show items" : "Hide items"}
    </button>
  );
}

/** The one-line stand-in for a section's hidden line items: "7 items · $4,200". */
export function ItemsCollapsedSummary({ count, total, onExpand }: { count: number; total: number | null; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
    >
      <span className="font-semibold text-foreground">
        {count} {count === 1 ? "item" : "items"}
        {total != null && <span className="text-muted-foreground"> · {formatCurrency(total)}</span>}
      </span>
      <span className="text-xs font-bold text-primary">Show items</span>
    </button>
  );
}

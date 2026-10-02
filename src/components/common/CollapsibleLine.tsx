import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One line item that collapses on its own: a chevron at the left (44px tap
 * target) switches between the compact row (CompactLineRow) and the full
 * item. Only the chevron toggles — inputs, dropdowns, the drag handle,
 * arrows and menus inside the row never do. The swap fades in quickly
 * (150ms, none with "reduce motion"). Shared by the Cost plan and the
 * Quote / Change Order builders.
 */
export function CollapsibleLine({
  collapsed,
  onToggle,
  label,
  compact,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** The item's name, for the chevron's label. */
  label: string;
  /** The compact row, shown while collapsed. */
  compact: ReactNode;
  /** The full item. */
  children: ReactNode;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  const name = label.trim() || "item";
  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        title={collapsed ? "Expand" : "Collapse"}
        className={cn(
          // 28px visible, 44px to tap (the ::before extends the hit area).
          "relative -ml-1 flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-subtle transition-colors before:absolute before:-inset-x-2.5 before:-inset-y-2 before:content-[''] hover:bg-muted hover:text-foreground sm:-ml-1.5",
          collapsed ? "mt-2 sm:mt-1.5" : "mt-3",
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
      <div key={collapsed ? "compact" : "full"} className="min-w-0 flex-1 duration-150 animate-in fade-in-0 motion-reduce:animate-none">
        {collapsed ? compact : children}
      </div>
    </div>
  );
}

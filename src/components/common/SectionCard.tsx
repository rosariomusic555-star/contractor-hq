import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ReorderControls } from "@/components/common/ReorderControls";
import { cn, formatCurrency, pluralize } from "@/lib/utils";

const HOVER_EXPAND_DELAY_MS = 600;
const SUMMARY_ITEM_CAP = 3;

function collapsedSummary(itemNames: string[]): string {
  if (itemNames.length === 0) return "No items yet";
  const named = itemNames.map((n) => n.trim() || "Untitled item");
  const shown = named.slice(0, SUMMARY_ITEM_CAP);
  const rest = named.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, +${rest} more` : shown.join(", ");
}

interface SectionCardProps {
  name: string;
  onRename: (name: string) => void;
  subtotal: number;
  /** Line item names, in order — used only for the collapsed summary line. */
  itemNames: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** True while any line item (in any section) is mid-drag — hovering a
   * collapsed section's header while this is true auto-expands it after a
   * short delay, so the item can be dropped inside. */
  isDraggingItem?: boolean;
  onAutoExpand?: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** The row directly under the header — the optional-section toggle in the
   * Quote builder, the Smart Section calculator link in the Materials Sheet
   * builder — plus its "Delete section" control. Differs per builder, hides
   * along with the item list while collapsed. */
  secondRow: ReactNode;
  /** The line item list + "Add item to this section" button. */
  children: ReactNode;
}

/**
 * A section card shared by the Quote builder and Materials Sheet builder —
 * the dark header (collapse chevron, editable name, item count/subtotal,
 * reorder controls), the collapsed-state summary line, and the collapse/
 * expand mechanics are identical in both. Everything builder-specific (the
 * second header row, the item rows themselves) is supplied by the caller
 * via `secondRow`/`children`. See the thin per-builder wrappers
 * QuoteSectionCard (QuoteWorkspace.tsx) and MaterialsSectionCard
 * (ProjectMaterialsView.tsx).
 *
 * Collapsing only hides content via CSS (`hidden`), never unmounts the item
 * list — the item Droppable stays mounted so cross-section item drag still
 * works while other sections are collapsed.
 */
export function SectionCard({
  name,
  onRename,
  subtotal,
  itemNames,
  collapsed,
  onToggleCollapse,
  isDraggingItem,
  onAutoExpand,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  secondRow,
  children,
}: SectionCardProps) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  // A drag can end (drop, or cancel via Escape) while the pointer is still
  // resting over this header — don't let a stale timer fire afterward.
  useEffect(() => {
    if (!isDraggingItem && hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = undefined;
    }
  }, [isDraggingItem]);

  const handleMouseEnter = () => {
    if (!collapsed || !isDraggingItem || !onAutoExpand) return;
    hoverTimer.current = setTimeout(onAutoExpand, HOVER_EXPAND_DELAY_MS);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = undefined;
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow",
        dragging && "opacity-90 shadow-card-hover",
      )}
    >
      {/* Slate section header — collapse chevron + editable name + running subtotal */}
      <div className="group flex items-center gap-3 bg-sidebar px-5 py-4">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          aria-expanded={!collapsed}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-background/90 transition-colors hover:bg-white/10 hover:text-background"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => onRename(e.target.value)}
            placeholder="New section"
            className="-ml-2.5 w-full rounded-lg border-none bg-transparent px-2.5 py-1 text-[19px] font-bold tracking-tight text-background outline-none transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-background/55">{pluralize(itemNames.length, "item")}</div>
          <div className="mt-0.5 text-[19px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(subtotal)}
          </div>
        </div>
        <ReorderControls
          tone="dark"
          dragHandleProps={dragHandleProps}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          label={name || "section"}
        />
      </div>

      {collapsed && (
        <p className="truncate px-5 py-3 text-[13px] text-muted-subtle">{collapsedSummary(itemNames)}</p>
      )}

      <div className={cn(collapsed && "hidden")}>
        {secondRow}
        <div className="p-[18px]">{children}</div>
      </div>
    </div>
  );
}

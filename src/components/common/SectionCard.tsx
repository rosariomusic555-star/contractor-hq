import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ReorderControls } from "@/components/common/ReorderControls";
import { ActionMenu } from "@/components/responsive/ActionMenu";
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
  /** Optional small tag shown under the name in the header (the
   * Materials Sheet's section project type). */
  tag?: ReactNode;
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
  tag,
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
      {/* Slate section header — collapse chevron + editable name + running
          subtotal, then (optional) the tag row. The tag row is its own
          full-width line indented to sit under the name (chevron 2rem +
          gap), so chips never get squeezed by the total/controls on a phone. */}
      {/* Phones: 44px chevron + "⋯" (reorder) targets, 17px type, tighter
          padding; sm+ as before. */}
      <div className="bg-sidebar px-3 py-3 sm:px-5 sm:py-4">
        <div className="group flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand section" : "Collapse section"}
            aria-expanded={!collapsed}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-background/90 transition-colors hover:bg-white/10 hover:text-background sm:h-8 sm:w-8"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
          </button>
          <div className="min-w-0 flex-1">
            {/* Auto-sized title: an invisible copy of the text and the input
              share one grid cell, so the cell (and the input filling it)
              hugs the text as it's typed — works in every browser, no
              measuring JS. min-w keeps an empty/short title easy to click
              (smaller on phones so the row never overflows);
              max-w-full stops it at this column, so it never reaches the
              count/total or reorder controls — past that it truncates with
              an ellipsis while not focused. The focus ring wraps only the
              input. Only the chevron collapses and only the grip drags, so
              clicking here does neither (pointer events stopped anyway). */}
            <div
              className="-ml-2.5 inline-grid min-w-[4rem] max-w-full grid-cols-[minmax(0,1fr)] align-top sm:min-w-[9rem]"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                aria-hidden
                className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-2.5 py-1 pr-3.5 text-[17px] font-bold tracking-tight sm:text-[19px]"
              >
                {name || "Section name"}
              </span>
              <input
                value={name}
                onChange={(e) => onRename(e.target.value)}
                placeholder="Section name"
                aria-label="Section name"
                size={1}
                className="col-start-1 row-start-1 w-full min-w-0 truncate rounded-lg border-none bg-transparent px-2.5 py-1 text-[17px] font-bold tracking-tight text-background outline-none sm:text-[19px] transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-background/55">{pluralize(itemNames.length, "item")}</div>
            <div className="mt-0.5 text-[17px] font-extrabold tracking-tight tabular-nums text-background sm:text-[19px]">
              {formatCurrency(subtotal)}
            </div>
          </div>
          {/* Drag + arrows on sm+; on phones the handle stays mounted (the
              drag library needs it) but hidden, and reorder is in "⋯". */}
          <div className="hidden sm:flex">
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
          <div className="-mr-1 sm:hidden">
            <ActionMenu
              tone="dark"
              title={name || "Section"}
              ariaLabel="Section actions"
              items={[
                { label: "Move up", icon: ArrowUp, onSelect: onMoveUp, disabled: !canMoveUp },
                { label: "Move down", icon: ArrowDown, onSelect: onMoveDown, disabled: !canMoveDown },
              ]}
            />
          </div>
        </div>
        {tag && <div className="mt-1 pl-[3.25rem] sm:pl-11">{tag}</div>}
      </div>

      {collapsed && (
        <p className="truncate px-3 py-3 text-[13px] text-muted-subtle sm:px-5">{collapsedSummary(itemNames)}</p>
      )}

      <div className={cn(collapsed && "hidden")}>
        {secondRow}
        <div className="p-3 sm:p-[18px]">{children}</div>
      </div>
    </div>
  );
}

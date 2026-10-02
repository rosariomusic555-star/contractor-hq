import type { ReactNode } from "react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ArrowDown, ArrowUp, Maximize2, MoreHorizontal } from "lucide-react";
import { ReorderControls } from "@/components/common/ReorderControls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * One line item while its section's items are collapsed — a slim row, not
 * hidden, so the list can still be sorted and rearranged: name (+ color /
 * product), quantity + unit, line total, and the same drag handle + up/down
 * arrows as the full row (on phones: long-press the handle to drag, or Move
 * up / down in the "⋯" menu). Tapping the name opens just this item.
 * Shared by the Cost plan and the Quote / Change Order builders.
 */
export function CompactLineRow({
  name,
  detail,
  quantity,
  unit,
  total,
  tag,
  dirty = false,
  onExpand,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  name: string;
  /** Color / product, after the name. */
  detail?: string | null;
  quantity: number;
  /** Unit label ("sq ft", "days"); "lump sum" reads as "Lump sum". */
  unit: string;
  total: number;
  /** A small badge before the total (e.g. "Optional"). */
  tag?: ReactNode;
  /** Unsaved edits on this item — a dot, so collapsing never hides them. */
  dirty?: boolean;
  onExpand: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const label = name.trim() || "Untitled item";
  const qty =
    unit.trim().toLowerCase() === "lump sum"
      ? "Lump sum"
      : `${Number(quantity || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit.trim() ? ` ${unit.trim()}` : ""}`;
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border border-hairline bg-card py-1 pl-3 pr-1 transition-shadow sm:min-h-10",
        dragging && "shadow-lg ring-1 ring-primary/30",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        title="Open this item"
        className="flex min-w-0 flex-1 flex-col text-left text-sm hover:text-primary sm:flex-row sm:items-baseline sm:gap-1.5"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate font-semibold", !name.trim() && "text-muted-foreground")}>{label}</span>
          {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-warning" title="Unsaved changes" aria-label="Unsaved changes" />}
        </span>
        {detail && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{detail}</span>}
        {/* Phones: the quantity sits under the name so the name gets the width. */}
        <span className="text-xs tabular-nums text-muted-foreground sm:hidden">{qty}</span>
      </button>
      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">{qty}</span>
      {tag}
      <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-foreground">{formatCurrency(total)}</span>
      {/* Desktop: grip + arrows. Phones: grip (long-press to drag) + ⋯ menu. */}
      <ReorderControls
        dragHandleProps={dragHandleProps}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        label={label}
        compact
        className="py-0.5"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${label}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:hidden"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp className="mr-2 h-4 w-4" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown className="mr-2 h-4 w-4" /> Move down
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExpand}>
            <Maximize2 className="mr-2 h-4 w-4" /> Open item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

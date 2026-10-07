import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ArrowDown, ArrowUp, Maximize2, MoreHorizontal, Trash2 } from "lucide-react";
import { ReorderControls } from "@/components/common/ReorderControls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * One line item while its section's items are collapsed — a slim row, not
 * hidden, so the list can still be sorted and rearranged: name (+ color /
 * product), quantity + unit, line total, and the same drag handle + up/down
 * arrows as the full row (on phones: long-press the handle to drag, or Move
 * up / down in the "⋯" menu). Tapping the name opens just this item.
 * Delete (when given): a trash icon at the right end (on hover with a
 * mouse, always on touch screens), Delete in the "⋯" menu, and swipe left
 * to reveal Delete. None of them toggle the row or start a drag.
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
  onDelete,
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
  /** Removes the line (the caller offers Undo). */
  onDelete?: () => void;
}) {
  const label = name.trim() || "Untitled item";
  const qty =
    unit.trim().toLowerCase() === "lump sum"
      ? "Lump sum"
      : `${Number(quantity || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit.trim() ? ` ${unit.trim()}` : ""}`;
  const swipe = useSwipeToReveal(!!onDelete && !dragging);
  return (
    // Clipped only while swiped, so a dragged row's shadow isn't cut off.
    <div className={cn("relative rounded-xl", swipe.offset !== 0 && "overflow-hidden")} {...swipe.containerProps}>
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            swipe.close();
            onDelete();
          }}
          data-swipe-delete
          tabIndex={swipe.open ? 0 : -1}
          aria-hidden={!swipe.open}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 rounded-r-xl bg-destructive text-sm font-bold text-destructive-foreground",
            swipe.offset === 0 && "invisible",
          )}
          style={{ width: SWIPE_REVEAL }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      )}
    <div
      className={cn(
        "group relative flex min-h-11 items-center gap-2 rounded-xl border border-hairline bg-card py-1 pl-3 pr-1 transition-shadow sm:min-h-10",
        dragging && "shadow-lg ring-1 ring-primary/30",
        swipe.settling && "transition-[transform,box-shadow] duration-200",
      )}
      style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
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
          {onDelete && (
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Desktop: trash at the end — on hover with a mouse, always on touch. */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Delete ${label}`}
          title="Delete"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:flex [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [fieldset:disabled_&]:hidden"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
    </div>
  );
}

/** How far a left swipe opens the row — the Delete button's width. */
const SWIPE_REVEAL = 88;

/**
 * Swipe left (touch only) to reveal the Delete button behind the row; swipe
 * back or tap the row to close. Vertical moves are left to the page
 * (touch-action: pan-y), a touch on the drag handle is left to the drag,
 * and the tap that ends a swipe never reaches the row's buttons.
 */
function useSwipeToReveal(enabled: boolean) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const gesture = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);

  const moveTo = (x: number, animate: boolean) => {
    offsetRef.current = x;
    setSettling(animate);
    setOffset(x);
  };
  const close = () => {
    setOpen(false);
    moveTo(0, true);
  };

  const containerProps = enabled
    ? {
        style: { touchAction: "pan-y" as const },
        onTouchStart: (e: ReactTouchEvent) => {
          suppressClick.current = false;
          if ((e.target as HTMLElement).closest("[data-rfd-drag-handle-draggable-id]")) return;
          // A locked document (approved change order) disables its fieldset.
          if ((e.currentTarget as HTMLElement).closest("fieldset:disabled")) return;
          const t = e.touches[0];
          gesture.current = { x: t.clientX, y: t.clientY, base: open ? -SWIPE_REVEAL : 0, horizontal: null };
        },
        onTouchMove: (e: ReactTouchEvent) => {
          const g = gesture.current;
          if (!g) return;
          const t = e.touches[0];
          const dx = t.clientX - g.x;
          const dy = t.clientY - g.y;
          if (g.horizontal === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            g.horizontal = Math.abs(dx) > Math.abs(dy);
          }
          if (!g.horizontal) return;
          suppressClick.current = true;
          moveTo(Math.min(0, Math.max(-SWIPE_REVEAL * 1.25, g.base + dx)), false);
        },
        onTouchEnd: () => {
          const g = gesture.current;
          gesture.current = null;
          if (!g?.horizontal) return;
          const reveal = offsetRef.current < -SWIPE_REVEAL / 2;
          setOpen(reveal);
          moveTo(reveal ? -SWIPE_REVEAL : 0, true);
        },
        onClickCapture: (e: ReactMouseEvent) => {
          const onDeleteButton = !!(e.target as HTMLElement).closest("[data-swipe-delete]");
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          } else if (open && !onDeleteButton) {
            // A tap on an open row closes it instead of opening the item.
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        },
      }
    : {};

  return { offset: enabled ? offset : 0, open: enabled && open, settling, close, containerProps };
}

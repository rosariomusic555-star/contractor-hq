import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";

interface ReorderControlsProps {
  /** From the wrapping <Draggable> — spread onto the grip button only, so
   * dragging can never start from anywhere else in the row (clicking into
   * an input never triggers it). */
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** What's being moved, for the button aria-labels — "section" or an item
   * name. */
  label: string;
  /** "light" for a line item row — sized to match the row's trash icon;
   * "dark" for a section's slate header — bigger and higher-contrast, since
   * it's the header's only icon-button and needs to read clearly against
   * the dark background. */
  tone?: "light" | "dark";
  className?: string;
}

/**
 * Drag handle + up/down arrow buttons — shared by the Quote builder and
 * Materials Sheet builder, for both section headers and line item rows (see
 * useSectionReorder). Pinned at the far right edge of its row: section
 * headers put it after the item count/total (name — spacer — count/total —
 * controls, hard against the header's own edge padding); item rows group it
 * with the delete icon (grip — arrows — delete), with extra margin before
 * delete so a reach for the down arrow can't mis-tap it.
 *
 * Two layered hover cues: a soft rounded-rectangle pill behind the whole
 * group (padded so the grip/arrows never touch its edges — the cluster
 * reads as one control), plus each button's own stronger, fully-inset
 * circular pill + brighter icon on top of that when hovered directly —
 * makes it obvious exactly which control is about to be clicked. Disabled
 * arrows opt out of both (pointer-events-none) and fall back to a default
 * cursor.
 *
 * The handle is a real focusable <button>; while it has focus, ArrowUp/
 * ArrowDown move the item exactly one position — the same one-step move the
 * arrow buttons do, not react-beautiful-dnd's own lift-then-arrow keyboard
 * drag (simpler, and it's what was actually asked for).
 */
export function ReorderControls({
  dragHandleProps,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  label,
  tone = "light",
  className,
}: ReorderControlsProps) {
  const isDark = tone === "dark";
  const idle = isDark ? "text-background/90" : "text-muted-subtle";
  const groupHoverBg = isDark ? "hover:bg-white/10" : "hover:bg-muted/60";
  const buttonHover = isDark
    ? "hover:bg-white/25 hover:text-background"
    : "hover:bg-muted hover:text-foreground";

  // Dark/header sizing is capped so the whole cluster (incl. the new outer
  // padding) never exceeds the header's own tallest other element (the
  // item-count/total block, ~47px) — otherwise this control would keep
  // forcing the header taller, which is exactly what this sizing avoids.
  // Light/item-row sizing has no such ceiling (the card has plenty of
  // height), so it stays closer to the trash icon's own weight.
  const gripBoxClass = isDark ? "h-8 w-8" : "h-7 w-7";
  const gripIconClass = isDark ? "h-4 w-4" : "h-[18px] w-[18px]";
  const chevronBoxClass = isDark ? "h-4 w-7" : "h-7 w-7";
  const chevronIconClass = isDark ? "h-3 w-3" : "h-4 w-4";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-xl px-1.5 py-1 transition-colors",
        idle,
        groupHoverBg,
        className,
      )}
    >
      <button
        type="button"
        {...dragHandleProps}
        aria-label={`Drag to reorder ${label} — or focus and press the arrow keys`}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onMoveUp();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onMoveDown();
          }
        }}
        className={cn(
          "flex cursor-grab items-center justify-center rounded-full transition-colors active:cursor-grabbing",
          gripBoxClass,
          buttonHover,
        )}
      >
        <GripVertical className={gripIconClass} />
      </button>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Move ${label} up`}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:cursor-default disabled:opacity-30",
            chevronBoxClass,
            buttonHover,
          )}
        >
          <ChevronUp className={chevronIconClass} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Move ${label} down`}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:cursor-default disabled:opacity-30",
            chevronBoxClass,
            buttonHover,
          )}
        >
          <ChevronDown className={chevronIconClass} />
        </button>
      </div>
    </div>
  );
}

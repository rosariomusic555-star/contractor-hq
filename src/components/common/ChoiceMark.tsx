import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * The mark on a selectable card / chip. Pick several → the real checkbox
 * square (same as MultiSelectList). Pick exactly one → a round radio dot,
 * never a square, so the two always look different. Visual only: the
 * clickable element around it carries role="checkbox" / "radio".
 */
export function ChoiceMark({ multi, checked, className }: { multi: boolean; checked: boolean; className?: string }) {
  if (multi) {
    return <Checkbox checked={checked} tabIndex={-1} aria-hidden className={cn("pointer-events-none", className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        checked ? "border-primary" : "border-primary/60",
        className,
      )}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  );
}

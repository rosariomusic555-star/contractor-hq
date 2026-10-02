import { cloneElement, forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Where a MultiSelectList opens: a popover on desktop, a bottom sheet on
 * phones (titled). `list` gets `large` (phone rows) and `close` (for Done).
 * `anchor`: the trigger only positions the popover and opens it itself
 * (e.g. a row of chips), instead of being the popover's own trigger.
 */
export function MultiSelectPopover({
  open,
  onOpenChange,
  title,
  trigger,
  anchor = false,
  modal = false,
  align = "start",
  contentClassName,
  list,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bottom-sheet title on phones. */
  title: string;
  trigger: ReactElement;
  anchor?: boolean;
  /** Inside another dialog: its own focus scope (keeps focus in the search box). */
  modal?: boolean;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  list: (opts: { large: boolean; close: () => void }) => ReactNode;
}) {
  const isMobile = useIsMobile();
  const close = () => onOpenChange(false);

  if (isMobile) {
    // No popover to open it: the trigger opens the sheet (unless it's an
    // anchor that opens it itself).
    const opener = anchor ? trigger : cloneElement(trigger, { onClick: () => onOpenChange(true) });
    return (
      <>
        {opener}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="px-4 text-left">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            <div className="mt-2">{list({ large: true, close })}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
      {anchor ? <PopoverPrimitive.Anchor asChild>{trigger}</PopoverPrimitive.Anchor> : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent className={cn("w-72 p-0", contentClassName)} align={align} collisionPadding={8}>
        {list({ large: false, close })}
      </PopoverContent>
    </Popover>
  );
}

const CHIP = "shrink-0 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground";
/** Room kept for the "+N" badge and the chevron, px. */
const RESERVE = 52;

/**
 * A multi-select's one-line trigger: the selected items as chips — as many
 * as fit, then "+N" — or the placeholder. Measures an invisible copy at
 * natural width, so the count follows the trigger's real width.
 */
export const ChipsTrigger = forwardRef<
  HTMLButtonElement,
  { chips: { id: string; label: string }[]; placeholder: string; open?: boolean } & ComponentPropsWithoutRef<"button">
>(function ChipsTrigger({ chips, placeholder, open, className, ...props }, ref) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(chips.length);
  const chipKey = chips.map((c) => `${c.id}:${c.label}`).join(",");
  useLayoutEffect(() => {
    const measure = () => {
      const box = triggerRef.current;
      const row = measureRef.current;
      if (!box || !row) return;
      const widths = [...row.children].map((el) => (el as HTMLElement).offsetWidth + 4);
      const room = box.clientWidth - 24;
      if (widths.reduce((a, b) => a + b, 0) <= room) return setFit(widths.length);
      let used = 0;
      let n = 0;
      while (n < widths.length && used + widths[n] <= room - RESERVE) {
        used += widths[n];
        n += 1;
      }
      setFit(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (triggerRef.current) ro.observe(triggerRef.current);
    return () => ro.disconnect();
  }, [chipKey]);

  return (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      className={cn(
        // contain: the chips never widen the trigger (or its column) — it
        // sizes from its own width class and shows "+N" instead.
        "relative flex h-9 min-w-0 items-center gap-1 overflow-hidden rounded-md [contain:inline-size] border border-input bg-background px-2 text-left text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {chips.length === 0 ? (
        <span className="truncate text-muted-foreground">{placeholder}</span>
      ) : (
        <>
          {chips.slice(0, fit).map((c) => (
            <span key={c.id} className={cn(CHIP, "min-w-0 shrink truncate")}>
              {c.label}
            </span>
          ))}
          {chips.length > fit && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">+{chips.length - fit}</span>
          )}
          {/* Off-screen copy at natural width, to measure what fits. */}
          <span ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1 whitespace-nowrap">
            {chips.map((c) => (
              <span key={c.id} className={CHIP}>
                {c.label}
              </span>
            ))}
          </span>
        </>
      )}
      <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
    </button>
  );
});

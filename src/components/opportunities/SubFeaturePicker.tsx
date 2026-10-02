import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toggleSubCategory } from "@/lib/possibleSubs";

const CHIP = "shrink-0 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground";
/** Lists longer than this get a search box. */
const SEARCH_FROM = 7;
/** Room kept for the "+N" badge and the chevron, px. */
const RESERVE = 52;

/**
 * Which of the job's features a possible sub serves — several at once (a
 * gas line for the fire pit and the outdoor kitchen). Checkbox list in the
 * ProjectTypeList style: clicking toggles without closing. "General" = not
 * tied to a feature: checked when nothing else is, and picking it clears
 * the features. Popover on desktop, bottom sheet on phones.
 */
export function SubFeaturePicker({
  label,
  value,
  features,
  onChange,
  className,
}: {
  /** The item's name, for the sheet title and the trigger's label. */
  label: string;
  /** Selected project type ids; empty = General. */
  value: string[];
  /** The job's own features (project types), in their order. */
  features: { id: string; name: string }[];
  onChange: (next: string[]) => void;
  /** Trigger width / placement. */
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Always in the job's feature order; a type no longer on the job is dropped.
  const selected = features.filter((f) => value.includes(f.id));
  const chips = selected;
  // As many chips as fit on the trigger, then "+N".
  const measureRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState(chips.length);
  const chipKey = chips.map((c) => c.id).join(",");
  useLayoutEffect(() => {
    const measure = () => {
      const box = triggerRef.current;
      const row = measureRef.current;
      if (!box || !row) return;
      const widths = [...row.children].map((el) => (el as HTMLElement).offsetWidth + 4);
      const total = widths.reduce((a, b) => a + b, 0);
      const room = box.clientWidth - 24;
      if (total <= room) return setFit(widths.length);
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
  const toggle = (id: string | null) => {
    const next = toggleSubCategory(selected.map((f) => f.id), id);
    onChange(features.map((f) => f.id).filter((fid) => next.includes(fid)));
  };
  const row = isMobile ? "min-h-12 text-base" : undefined;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-label={`${label} goes with`}
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "relative flex h-9 w-64 min-w-0 items-center gap-1 overflow-hidden rounded-md border border-input bg-background px-2 text-left text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {chips.length === 0 ? (
        <span className="truncate text-muted-foreground">General</span>
      ) : (
        <>
          {chips.slice(0, fit).map((f) => (
            <span key={f.id} className={cn(CHIP, "min-w-0 shrink truncate")}>
              {f.name}
            </span>
          ))}
          {chips.length > fit && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">+{chips.length - fit}</span>
          )}
          {/* Off-screen copy at natural width, to measure what fits. */}
          <span ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1 whitespace-nowrap">
            {chips.map((f) => (
              <span key={f.id} className={CHIP}>
                {f.name}
              </span>
            ))}
          </span>
        </>
      )}
      <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
    </button>
  );

  const list = (
    <Command>
      {features.length > SEARCH_FROM && (
        <CommandInput value={search} onValueChange={setSearch} placeholder="Search features…" className={isMobile ? "h-12 text-base" : undefined} />
      )}
      <CommandList className={isMobile ? "max-h-[60vh]" : "max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)-1rem))]"}>
        <CommandEmpty>No matching feature.</CommandEmpty>
        <CommandGroup>
          <CommandItem value="__general__ General" onSelect={() => toggle(null)} className={row}>
            <Check className={cn("mr-2 h-4 w-4", selected.length === 0 ? "opacity-100" : "opacity-0")} />
            <span>General</span>
            <span className="ml-auto pl-2 text-xs text-muted-foreground">not tied to a feature</span>
          </CommandItem>
        </CommandGroup>
        {features.length > 0 && <CommandSeparator />}
        <CommandGroup>
          {features.map((f) => (
            <CommandItem key={f.id} value={`${f.name} ${f.id}`} onSelect={() => toggle(f.id)} className={row}>
              <Check className={cn("mr-2 h-4 w-4", value.includes(f.id) ? "opacity-100" : "opacity-0")} />
              {f.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="text-left">
              <SheetTitle>{label} goes with</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{list}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end" collisionPadding={8}>
        {list}
      </PopoverContent>
    </Popover>
  );
}

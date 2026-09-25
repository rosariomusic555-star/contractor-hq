import { useEffect, useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { SectionFeatureOption } from "@/lib/sectionFeatures";

export interface SectionFeaturePicker {
  primary: SectionFeatureOption[];
  other: SectionFeatureOption[];
  /** Types that already have a section on this sheet/quote (not counting
   * this one) — listed after the rest, marked "Already added", still pickable. */
  usedCategoryIds: Set<string>;
  /** A feature was picked: set the name and the type together. */
  onPick: (option: SectionFeatureOption) => void;
  /** Typing finished (Enter / click away) — e.g. auto-type a matching name. */
  onCommit: () => void;
  /** Open the picker as soon as this mounts (a just-added blank section). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}

/**
 * A section card's name, auto-sized to its text (an invisible copy of the
 * text and the input share one grid cell, so the input hugs what's typed;
 * past the column width it truncates). Used by SectionCard in every
 * builder.
 *
 * With a `picker` (Quote + Materials Sheet builders) the field is also the
 * feature picker: focusing it opens the project's features right under it
 * (desktop), or a bottom sheet (phones). Picking one sets the name and the
 * type; typing filters the list and Enter / clicking away keeps the typed
 * name. Without a picker (Change Orders) it's a plain name input.
 *
 * Pointer and click events never reach the card, so nothing here collapses
 * or drags the section.
 */
export function SectionNameField({
  name,
  onRename,
  picker,
}: {
  name: string;
  onRename: (name: string) => void;
  picker?: SectionFeaturePicker;
}) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // Show everything until the user actually types — clicking a section
  // named "Paver Patio" shouldn't filter the list down to just that.
  const [query, setQuery] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [active, setActive] = useState(-1);

  const openPicker = () => {
    if (!picker) return;
    setQuery(null);
    setShowOther(false);
    setActive(-1);
    setOpen(true);
  };
  const close = (commit: boolean) => {
    setOpen(false);
    if (commit) picker?.onCommit();
  };

  useEffect(() => {
    if (!picker?.autoOpen) return;
    if (!isMobile) inputRef.current?.focus();
    openPicker();
    picker.onAutoOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.autoOpen]);

  const rows = useMemo(() => {
    if (!picker) return [];
    const q = (query ?? "").trim().toLowerCase();
    const match = (o: SectionFeatureOption) => !q || o.label.toLowerCase().includes(q);
    // Already-added features sink below the rest of their group.
    const ordered = (list: SectionFeatureOption[]) => [
      ...list.filter((o) => !o.categoryId || !picker.usedCategoryIds.has(o.categoryId)),
      ...list.filter((o) => o.categoryId && picker.usedCategoryIds.has(o.categoryId)),
    ];
    const primary = ordered(picker.primary).filter(match);
    // Typing searches everything; otherwise "Other features…" expands the rest.
    const other = q || showOther ? ordered(picker.other).filter(match) : [];
    return [...primary.map((o) => ({ o, group: "primary" as const })), ...other.map((o) => ({ o, group: "other" as const }))];
  }, [picker, query, showOther]);

  const pick = (o: SectionFeatureOption) => {
    picker?.onPick(o);
    close(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!picker) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openPicker();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && rows[active]) pick(rows[active].o);
      else {
        close(true);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const list = picker && (
    <FeatureList
      rows={rows}
      active={active}
      usedCategoryIds={picker.usedCategoryIds}
      currentName={name}
      hasOther={picker.other.length > 0}
      showOther={showOther || !!query?.trim()}
      onShowOther={() => setShowOther(true)}
      onHover={setActive}
      onPick={pick}
      typed={query?.trim() ? name.trim() : ""}
      onKeepTyped={() => {
        close(true);
        inputRef.current?.blur();
      }}
    />
  );

  const field = (
    <div
      className={cn(
        "-ml-2.5 inline-grid max-w-full grid-cols-[minmax(0,1fr)] align-top sm:min-w-[9rem]",
        // Room for a short name plus the picker chevron on a phone.
        picker ? "min-w-[6rem]" : "min-w-[4rem]",
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        aria-hidden
        className={cn(
          "invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-2.5 py-1 text-[19px] font-bold tracking-tight",
          picker ? "pr-6 sm:pr-8" : "pr-3.5",
        )}
      >
        {name || (picker ? "Pick a feature or type a name" : "Section name")}
      </span>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => {
          onRename(e.target.value);
          setQuery(e.target.value);
          setActive(-1);
          if (picker && !open) setOpen(true);
        }}
        onFocus={() => !isMobile && openPicker()}
        // Phones: tapping opens the bottom sheet (which has its own input)
        // instead of typing in the header under the keyboard.
        onClick={() => isMobile && openPicker()}
        readOnly={!!picker && isMobile}
        onBlur={() => {
          if (open && !isMobile) close(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={picker ? "Pick a feature or type a name" : "Section name"}
        aria-label="Section name"
        role={picker ? "combobox" : undefined}
        aria-expanded={picker ? open : undefined}
        aria-autocomplete={picker ? "list" : undefined}
        size={1}
        className={cn(
          "col-start-1 row-start-1 w-full min-w-0 truncate rounded-lg border-none bg-transparent px-2.5 py-1 text-[19px] font-bold tracking-tight text-background outline-none transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary",
          picker && "pr-6 sm:pr-8",
        )}
      />
      {picker && (
        <ChevronDown
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 mr-1.5 h-3.5 w-3.5 self-center justify-self-end text-background/60 sm:mr-2 sm:h-4 sm:w-4"
        />
      )}
    </div>
  );

  if (!picker) return field;

  if (isMobile) {
    return (
      <>
        {field}
        <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close(true))}>
          <SheetContent
            side="bottom"
            // List first: don't pop the keyboard over it on open — tap the
            // input to type a custom name.
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5"
          >
            <SheetHeader className="text-left">
              <SheetTitle>Section name</SheetTitle>
            </SheetHeader>
            <Input
              value={name}
              onChange={(e) => {
                onRename(e.target.value);
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  close(true);
                }
              }}
              placeholder="Pick a feature below or type a name"
              aria-label="Section name"
              enterKeyHint="done"
              className="mt-3 h-12 text-base"
            />
            <div className="mt-3">{list}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={(o) => !o && close(true)}>
      <PopoverPrimitive.Anchor asChild>{field}</PopoverPrimitive.Anchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 p-1"
        // Keep focus (and typing) in the header input.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Clicking the input itself isn't "outside".
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {list}
      </PopoverContent>
    </Popover>
  );
}

function FeatureList({
  rows,
  active,
  usedCategoryIds,
  currentName,
  hasOther,
  showOther,
  onShowOther,
  onHover,
  onPick,
  typed,
  onKeepTyped,
}: {
  rows: { o: SectionFeatureOption; group: "primary" | "other" }[];
  active: number;
  usedCategoryIds: Set<string>;
  currentName: string;
  hasOther: boolean;
  showOther: boolean;
  onShowOther: () => void;
  onHover: (i: number) => void;
  onPick: (o: SectionFeatureOption) => void;
  typed: string;
  onKeepTyped: () => void;
}) {
  const firstOther = rows.findIndex((r) => r.group === "other");
  return (
    <div role="listbox" aria-label="Features" className="max-h-72 overflow-y-auto">
      {rows.length === 0 && !typed && (
        <p className="px-3 py-2 text-xs text-muted-foreground">No project types yet — type a name.</p>
      )}
      {rows.map(({ o }, i) => {
        const used = !!o.categoryId && usedCategoryIds.has(o.categoryId);
        const current = currentName.trim().toLowerCase() === o.label.toLowerCase();
        return (
          <div key={o.key}>
            {i === firstOther && i > 0 && <div className="my-1 border-t border-hairline" />}
            {i === firstOther && (
              <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-subtle">Other features</p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(o);
              }}
              onMouseEnter={() => onHover(i)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm md:min-h-9",
                i === active ? "bg-muted" : "hover:bg-muted",
                used && "text-muted-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
              {used && <span className="shrink-0 text-[11px] text-muted-subtle">Already added</span>}
              {current && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          </div>
        );
      })}
      {hasOther && !showOther && (
        <>
          <div className="my-1 border-t border-hairline" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onShowOther();
            }}
            className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-primary hover:bg-muted md:min-h-9"
          >
            Other features…
          </button>
        </>
      )}
      {typed && (
        <>
          <div className="my-1 border-t border-hairline" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onKeepTyped();
            }}
            className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted md:min-h-9"
          >
            Use “<span className="truncate font-semibold">{typed}</span>” as the name
          </button>
        </>
      )}
    </div>
  );
}

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Muted text on the right of the row. */
  hint?: string;
}

/** An "on its own" option pinned above the list (General, Auto, None…). */
export interface ExclusiveOption extends MultiSelectOption {
  /** Default: checked when nothing in the list is. */
  checked?: boolean;
  /** Default: clears the list. */
  onSelect?: () => void;
}

/** Lists longer than this get search ("auto"). */
const SEARCH_FROM = 7;
/** Lists longer than this get Select all / Clear (when allowed). */
const BULK_FROM = 5;

/**
 * The one multi-select list (pick several): a real checkbox square on every
 * row, "Select all that apply" on top, "N selected" + Done at the bottom.
 * Clicking a row toggles without closing; Done (or Escape, via the popover
 * / sheet around it) closes. Single-select pickers never use this — they
 * keep a checkmark and close on pick, so the two always look different.
 *
 * - `exclusive`: "on its own" option(s) (General · not tied to a feature)
 *   pinned on top above a divider, same checkbox. By default checked when
 *   nothing else is; checking it clears the rest, checking anything else
 *   unchecks it. Several (Auto / None) can set their own state + action.
 * - `bulk`: Select all / Clear, for filters and bulk lists (not pickers
 *   with an exclusive option).
 * - `children`: extra rows after the options (e.g. "+ Add as a new type").
 *
 * Keyboard: arrows move, Enter or Space toggles, Escape closes.
 */
export function MultiSelectList({
  options,
  value,
  onChange,
  exclusive,
  search = "auto",
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  bulk = false,
  onDone,
  large = false,
  emptyText = "No matches.",
  listClassName,
  children,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  exclusive?: ExclusiveOption | ExclusiveOption[];
  /** Show a search box: always, never, or past 7 options. */
  search?: boolean | "auto";
  searchPlaceholder?: string;
  /** Controlled search text (for `children` that react to it). */
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  bulk?: boolean;
  /** Footer Done button; omitted = no footer (an inline list). */
  onDone?: () => void;
  /** Phone bottom sheets: 44px+ rows, larger text. */
  large?: boolean;
  emptyText?: string;
  listClassName?: string;
  children?: ReactNode;
}) {
  const [ownSearch, setOwnSearch] = useState("");
  const text = searchValue ?? ownSearch;
  const setText = onSearchChange ?? setOwnSearch;
  const rootRef = useRef<HTMLDivElement>(null);
  const showSearch = search === true || (search === "auto" && options.length > SEARCH_FROM);
  const selectedCount = value.filter((id) => options.some((o) => o.id === id)).length;
  const exclusives = Array.isArray(exclusive) ? exclusive : exclusive ? [exclusive] : [];

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  // A soft highlight (not the solid green one) so the row's checkbox stays visible.
  const row = cn(
    "gap-3 data-[selected='true']:bg-muted data-[selected=true]:text-foreground",
    large ? "min-h-12 text-base" : "min-h-11 sm:min-h-9",
  );

  // Space toggles the highlighted row (Enter already does, via cmdk) —
  // unless it's a space typed into the search text.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " " || (showSearch && text !== "")) return;
    const active = rootRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]');
    if (!active) return;
    e.preventDefault();
    active.click();
  };

  const box = (checked: boolean) => (
    <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
  );

  return (
    <Command ref={rootRef} onKeyDown={onKeyDown}>
      {showSearch && (
        <CommandInput value={text} onValueChange={setText} placeholder={searchPlaceholder} className={large ? "h-12 text-base" : undefined} />
      )}
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
        <span className="text-xs text-muted-foreground">Select all that apply</span>
        {bulk && options.length > BULK_FROM && (
          <span className="flex gap-3 text-xs font-semibold">
            <button type="button" onClick={() => onChange(options.map((o) => o.id))} className="text-primary hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-muted-foreground hover:text-foreground hover:underline">
              Clear
            </button>
          </span>
        )}
      </div>
      <CommandList
        aria-multiselectable
        className={cn(large ? "max-h-[55vh]" : "max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)-7rem))]", listClassName)}
      >
        <CommandEmpty>{emptyText}</CommandEmpty>
        {exclusives.length > 0 && (
          <>
            <CommandGroup>
              {exclusives.map((ex) => {
                const on = ex.checked ?? selectedCount === 0;
                return (
                  <CommandItem key={ex.id} value={`__exclusive__ ${ex.id} ${ex.label}`} onSelect={ex.onSelect ?? (() => onChange([]))} className={row} aria-checked={on}>
                    {box(on)}
                    <span className="min-w-0 flex-1 truncate">{ex.label}</span>
                    {ex.hint && <span className="shrink-0 text-xs text-muted-foreground">{ex.hint}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {options.length > 0 && <CommandSeparator />}
          </>
        )}
        {/* With pinned options there's always a row, so cmdk's Empty never shows. */}
        {options.length === 0 && exclusives.length > 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>}
        <CommandGroup>
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <CommandItem key={o.id} value={`${o.label} ${o.id}`} onSelect={() => toggle(o.id)} className={row} aria-checked={on}>
                {box(on)}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {children}
      </CommandList>
      {onDone && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">{selectedCount} selected</span>
          <Button type="button" size="sm" onClick={onDone} className={large ? "h-10 px-5" : "h-8"}>
            Done
          </Button>
        </div>
      )}
    </Command>
  );
}

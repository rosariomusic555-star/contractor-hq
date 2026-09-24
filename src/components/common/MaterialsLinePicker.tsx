import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { MaterialsItem, MaterialsSection } from "@/lib/api";
import { materialLineLabel } from "@/lib/materialsMath";

interface MaterialsLinePickerProps {
  sections: MaterialsSection[];
  value: string | null;
  onChange: (materialsItemId: string | null) => void;
  /** Ranked matches (from suggestMaterialsItemMatches) shown first, above
   * the alphabetical rest — the "suggest automatically, let me confirm"
   * behavior from Phase 2. */
  suggested?: MaterialsItem[];
  placeholder?: string;
  className?: string;
}

/**
 * Matches a delivery line to a project's sheet line (Phase 2) — or leaves
 * it "Unplanned" (value null). Flat list across every section/sheet on the
 * project since a delivery can arrive before a project settles on which
 * sheet is "the" one. Reused by both the delivery-logging form and the
 * Materials Sheet's own Unplanned-items re-matching.
 */
export function MaterialsLinePicker({ sections, value, onChange, suggested = [], placeholder, className }: MaterialsLinePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allItems = sections.flatMap((s) => s.materials_items.map((item) => ({ item, sectionName: s.name })));
  const selected = allItems.find((r) => r.item.id === value);

  const term = search.trim().toLowerCase();
  const filtered = term ? allItems.filter((r) => materialLineLabel(r.item).toLowerCase().includes(term)) : allItems;
  const suggestedIds = new Set(suggested.map((s) => s.id));
  const suggestedRows = filtered.filter((r) => suggestedIds.has(r.item.id));
  const restRows = filtered.filter((r) => !suggestedIds.has(r.item.id));

  const select = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? materialLineLabel(selected.item) : (placeholder ?? "Unplanned — no sheet match")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search sheet lines…" />
          <CommandList>
            <CommandGroup>
              <CommandItem value="__unplanned__" onSelect={() => select(null)}>
                <Check className={cn("mr-2 h-4 w-4", value == null ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">Unplanned — no sheet match</span>
              </CommandItem>
            </CommandGroup>
            {suggestedRows.length > 0 && (
              <CommandGroup heading="Suggested">
                {suggestedRows.map((r) => (
                  <CommandItem key={r.item.id} value={r.item.id} onSelect={() => select(r.item.id)}>
                    <Check className={cn("mr-2 h-4 w-4", value === r.item.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{materialLineLabel(r.item)}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-subtle">{r.sectionName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {restRows.length > 0 && (
              <CommandGroup heading={suggestedRows.length > 0 ? "All lines" : undefined}>
                {restRows.map((r) => (
                  <CommandItem key={r.item.id} value={r.item.id} onSelect={() => select(r.item.id)}>
                    <Check className={cn("mr-2 h-4 w-4", value === r.item.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{materialLineLabel(r.item)}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-subtle">{r.sectionName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {filtered.length === 0 && <CommandEmpty>No sheet lines match.</CommandEmpty>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

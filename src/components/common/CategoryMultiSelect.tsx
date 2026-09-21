import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listCategories, type Category } from "@/lib/api";

interface CategoryMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Job type multi-select (migration 0079) — drawn from Settings > Categories
 * ("Job Categories"), the same list quote line items tag for Revenue by
 * category. A job can be several types at once (Paver patio + Outdoor
 * kitchen + Fire pit + Steps), so this is a checkbox list in a popover, not
 * a single <Select>. The trigger itself renders the current selection as
 * chips — clicking an item toggles it without closing the popover, so
 * picking several is one continuous interaction.
 */
export function CategoryMultiSelect({ value, onChange, placeholder, className }: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const selected = value.map((id) => byId.get(id)).filter((c): c is Category => !!c);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder ?? "Select types…"}</span>
          ) : (
            selected.map((c) => (
              <Badge key={c.id} variant="secondary" className="font-semibold">
                {c.name}
              </Badge>
            ))
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandList>
            {categories.length === 0 && <CommandEmpty>No categories yet — add some in Settings.</CommandEmpty>}
            <CommandGroup>
              {categories.map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => toggle(c.id)}>
                  <Check className={cn("mr-2 h-4 w-4", value.includes(c.id) ? "opacity-100" : "opacity-0")} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

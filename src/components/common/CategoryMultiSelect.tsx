import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/api";
import { ProjectTypeList } from "@/components/common/ProjectTypeList";
import { useProjectTypeOptions } from "@/hooks/use-project-type-options";

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
 * picking several is one continuous interaction. The list itself is the
 * shared ProjectTypeList (same types, order and search as FeatureTypeChips).
 */
export function CategoryMultiSelect({ value, onChange, placeholder, className }: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { options } = useProjectTypeOptions();
  const byId = new Map(options.map((c) => [c.id, c]));
  const selected = value.map((id) => byId.get(id)).filter((c): c is Category => !!c);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    // modal: its own focus scope, so a surrounding Dialog (the New
    // Opportunity modal) doesn't pull focus out of the search box.
    <Popover open={open} onOpenChange={setOpen} modal>
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
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" collisionPadding={8}>
        <ProjectTypeList value={value} onToggle={toggle} />
      </PopoverContent>
    </Popover>
  );
}

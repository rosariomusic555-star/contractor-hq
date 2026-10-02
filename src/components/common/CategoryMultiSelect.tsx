import { useState } from "react";
import type { Category } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectTypeList } from "@/components/common/ProjectTypeList";
import { ChipsTrigger, MultiSelectPopover } from "@/components/common/MultiSelectPopover";
import { useProjectTypeOptions } from "@/hooks/use-project-type-options";

interface CategoryMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Job type multi-select (migration 0079) — drawn from Settings › Project
 * types, the same list quote line items tag for Revenue by category. A job
 * can be several types at once (Paver patio + Outdoor kitchen + Fire pit +
 * Steps): the shared multi-select (checkbox rows, Done) in a popover, or a
 * bottom sheet on phones. The trigger shows the selection as chips with
 * "+N" overflow. The list itself is ProjectTypeList (same types, order and
 * search as FeatureTypeChips).
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
    <MultiSelectPopover
      open={open}
      onOpenChange={setOpen}
      title="Project types"
      // modal: its own focus scope, so a surrounding Dialog (the New
      // Opportunity modal) doesn't pull focus out of the search box.
      modal
      contentClassName="w-[max(var(--radix-popover-trigger-width),18rem)]"
      trigger={
        <ChipsTrigger
          open={open}
          chips={selected.map((c) => ({ id: c.id, label: c.name }))}
          placeholder={placeholder ?? "Select types…"}
          className={cn("h-10 w-full text-sm", className)}
        />
      }
      list={({ large, close }) => <ProjectTypeList value={value} onToggle={toggle} large={large} onDone={close} />}
    />
  );
}

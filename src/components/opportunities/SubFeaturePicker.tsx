import { useState } from "react";
import { MultiSelectList } from "@/components/common/MultiSelectList";
import { ChipsTrigger, MultiSelectPopover } from "@/components/common/MultiSelectPopover";
import { cn } from "@/lib/utils";

/**
 * Which of the job's features a possible sub serves — several at once (a
 * gas line for the fire pit and the outdoor kitchen). The shared
 * multi-select: checkbox rows, clicking toggles without closing, Done
 * closes. "General · not tied to a feature" is the exclusive option on top:
 * checked when nothing else is, checking it clears the features, checking a
 * feature unchecks it. Popover on desktop, bottom sheet on phones.
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
  const [open, setOpen] = useState(false);
  // Always in the job's feature order; a type no longer on the job is dropped.
  const selected = features.filter((f) => value.includes(f.id));

  return (
    <MultiSelectPopover
      open={open}
      onOpenChange={setOpen}
      title={`${label} goes with`}
      align="end"
      contentClassName="w-72"
      trigger={
        <ChipsTrigger
          open={open}
          aria-label={`${label} goes with`}
          chips={selected.map((f) => ({ id: f.id, label: f.name }))}
          placeholder="General"
          className={cn("w-64", className)}
        />
      }
      list={({ large, close }) => (
        <MultiSelectList
          options={features.map((f) => ({ id: f.id, label: f.name }))}
          value={selected.map((f) => f.id)}
          onChange={(next) => onChange(features.map((f) => f.id).filter((id) => next.includes(id)))}
          exclusive={{ id: "__general__", label: "General", hint: "not tied to a feature" }}
          searchPlaceholder="Search features…"
          large={large}
          onDone={close}
          emptyText="No matching feature."
        />
      )}
    />
  );
}

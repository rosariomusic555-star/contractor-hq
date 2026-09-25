import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/api";
import { SheetSelect } from "@/components/responsive/SheetSelect";

const NONE = "__none__";

/** Chip look for the dark section headers. 32px tall on phones (+ an
 * invisible hit area to 44px), 24px from sm up. */
export const HEADER_CHIP =
  "relative inline-flex h-8 max-w-full items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] sm:h-6 sm:px-2.5 sm:text-[11px] sm:before:hidden";

/**
 * A section's project-type tag as a clickable chip for the dark section
 * header (Materials Sheet and Quote builder). Options are the project's own
 * Project types; a tag that's no longer among them stays visible/selectable.
 * Opens as a bottom sheet on phones, a dropdown on desktop (portalled, so
 * the header never clips it); events are stopped so it can never collapse
 * or drag the section.
 */
export function ProjectTypeChip({
  value,
  options,
  allCategories,
  onChange,
}: {
  value: string | null;
  /** The project's own Project types. */
  options: Category[];
  /** Every job category — names a tag that isn't in `options` anymore. */
  allCategories: Category[];
  onChange: (categoryId: string | null) => void;
}) {
  const name = value ? (allCategories.find((c) => c.id === value)?.name ?? null) : null;
  const list = value && name && !options.some((c) => c.id === value) ? [...options, { id: value, name } as Category] : options;

  return (
    <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="inline-flex max-w-full">
      <SheetSelect
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        options={[{ value: NONE, label: "No project type" }, ...list.map((c) => ({ value: c.id, label: c.name }))]}
        title="Project type"
        ariaLabel="Project type"
        triggerClassName={cn(
          HEADER_CHIP,
          // Reset the desktop Select trigger's default input look.
          "w-auto border-none py-0 shadow-none ring-offset-sidebar focus:ring-2 focus:ring-primary focus:ring-offset-1 [&>svg]:hidden",
          name
            ? "bg-white/[0.18] text-background hover:bg-white/[0.28]"
            : "border border-dashed border-white/35 bg-transparent text-background/70 hover:border-white/60 hover:bg-white/10 hover:text-background",
        )}
        renderTrigger={() => (
          <>
            <span className="truncate">{name ?? "Add project type"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-80" />
          </>
        )}
        footer={
          list.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Add Project types on the project first.</p> : undefined
        }
      />
    </span>
  );
}

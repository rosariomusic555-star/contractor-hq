import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/api";

const NONE = "__none__";

/**
 * A section's project-type tag as a clickable chip for the dark section
 * header (Materials Sheet and Quote builder). Options are the project's own
 * Project types; a tag that's no longer among them stays visible/selectable.
 * The menu portals to <body>, so the header's rounded/overflow-hidden
 * corners never clip it, and pointer/click events are stopped so it can
 * never collapse or drag the section.
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
    <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger
          aria-label="Project type"
          className={cn(
            // Reset the default trigger (full-width, input look) to a chip.
            "h-6 w-auto gap-1 rounded-full border-none px-2.5 py-0 text-[11px] font-semibold shadow-none ring-offset-sidebar transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-80",
            name
              ? "bg-white/[0.18] text-background hover:bg-white/[0.28]"
              : "border border-dashed border-white/35 bg-transparent text-background/70 hover:border-white/60 hover:bg-white/10 hover:text-background",
          )}
        >
          <span>{name ?? "Add project type"}</span>
        </SelectTrigger>
        <SelectContent className="z-50">
          <SelectItem value={NONE}>No project type</SelectItem>
          {list.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          {list.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Add Project types on the project first.</div>
          )}
        </SelectContent>
      </Select>
    </span>
  );
}

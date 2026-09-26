import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, formatCurrency } from "@/lib/utils";
import type { Category } from "@/lib/api";

/** A quote section's link to materials sheet sections (0095). */
export interface SectionMaterialsLink {
  mode: "auto" | "manual";
  manualIds: string[];
  /** What "Auto" currently resolves to (matched by project type / name). */
  autoMatchedIds: string[];
  sheetSections: { id: string; name: string }[];
  /** Cost of the sections actually linked right now. */
  cost: number;
  onChange: (next: { mode: "auto" | "manual"; ids: string[] }) => void;
}

/**
 * The one chip under a section's name in the dark header — Quote builder
 * and Materials Sheet builder alike:
 *   "Outdoor Kitchen · Materials $1,240 ▾"   (quote, linked)
 *   "Outdoor Kitchen · No materials ▾"       (quote, nothing linked — muted)
 *   "Outdoor Kitchen ▾"                      (materials sheet)
 *   "Add project type ▾"                     (no type yet)
 * One dropdown with the section's project type (single select) and, for a
 * quote, its linked materials ("Auto (match by project type)" by default,
 * or specific sheet sections, or none). On Auto, changing the type relinks
 * by itself — the auto match follows the type live.
 *
 * A type that's no longer one of the project's types stays visible and
 * selectable, marked "not on project" (removing a type never re-tags a
 * section). Popover on desktop, bottom sheet on phones; pointer/click
 * events never reach the card, so it can't collapse or drag the section.
 */
export function SectionTypeChip({
  value,
  options,
  allCategories,
  onChange,
  materials,
}: {
  value: string | null;
  /** The project's own Project types. */
  options: Category[];
  /** Every job category — names a tag that isn't in `options` anymore. */
  allCategories: Category[];
  onChange: (categoryId: string | null) => void;
  /** Quote sections only. */
  materials?: SectionMaterialsLink;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const name = value ? (allCategories.find((c) => c.id === value)?.name ?? null) : null;
  const removed = !!value && !!name && !options.some((c) => c.id === value);
  const typeList = removed ? [...options, { id: value!, name } as Category] : options;

  const linkedIds = materials
    ? materials.mode === "auto"
      ? materials.autoMatchedIds
      : materials.manualIds.filter((id) => materials.sheetSections.some((s) => s.id === id))
    : [];
  const hasMaterials = linkedIds.length > 0;

  const label = !name ? (
    "Add project type"
  ) : (
    <>
      {name}
      {removed && <span className="font-normal text-background/60"> · not on project</span>}
      {materials && (
        <span className={cn("font-normal", !hasMaterials && "text-background/60")}>
          {" · "}
          {hasMaterials ? `Cost ${formatCurrency(materials.cost)}` : "No cost linked"}
        </span>
      )}
    </>
  );

  const toggleSection = (id: string, checked: boolean) => {
    if (!materials) return;
    const base = materials.mode === "auto" ? materials.autoMatchedIds : materials.manualIds;
    const ids = checked ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    materials.onChange({ mode: "manual", ids });
  };

  const body = (
    <div className="space-y-1">
      <Group title="Project type">
        <Row selected={!value} onClick={() => onChange(null)}>
          No project type
        </Row>
        {typeList.map((c) => (
          <Row key={c.id} selected={value === c.id} onClick={() => onChange(c.id)}>
            {c.name}
            {removed && c.id === value && <span className="ml-1 text-[11px] text-muted-subtle">not on project</span>}
          </Row>
        ))}
        {typeList.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Add Project types on the project first.</p>}
      </Group>

      {materials && (
        <>
          <div className="my-1 border-t border-hairline" />
          <Group title="Linked cost plan sections">
            <Row selected={materials.mode === "auto"} onClick={() => materials.onChange({ mode: "auto", ids: [] })}>
              Auto <span className="ml-1 text-[11px] text-muted-foreground">(match by project type)</span>
            </Row>
            {materials.sheetSections.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">This quote's cost plan has no sections yet.</p>
            ) : (
              materials.sheetSections.map((s) => (
                <label
                  key={s.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted md:min-h-8"
                >
                  <Checkbox checked={linkedIds.includes(s.id)} onCheckedChange={(v) => toggleSection(s.id, v === true)} />
                  <span className="truncate">{s.name || "Untitled section"}</span>
                </label>
              ))
            )}
            <Row
              selected={materials.mode === "manual" && linkedIds.length === 0}
              onClick={() => materials.onChange({ mode: "manual", ids: [] })}
            >
              None
            </Row>
          </Group>
        </>
      )}
    </div>
  );

  const trigger = (
    <button
      type="button"
      aria-label={materials ? "Project type and linked cost" : "Project type"}
      title={removed ? `${name} is no longer one of this project's types` : undefined}
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
        name
          ? "bg-white/[0.18] text-background hover:bg-white/[0.28]"
          : "border border-dashed border-white/35 text-background/70 hover:border-white/60 hover:bg-white/10 hover:text-background",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3 w-3 shrink-0 opacity-80" />
    </button>
  );

  return (
    <span className="inline-flex max-w-full" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {isMobile ? (
        <>
          {trigger}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5"
            >
              <SheetHeader className="text-left">
                <SheetTitle>{materials ? "Project type & materials" : "Project type"}</SheetTitle>
              </SheetHeader>
              <div className="mt-3">{body}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="z-50 max-h-[70vh] w-72 overflow-y-auto p-2">
            {body}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{title}</p>
      {children}
    </div>
  );
}

function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted md:min-h-8",
        selected && "font-semibold text-primary",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}

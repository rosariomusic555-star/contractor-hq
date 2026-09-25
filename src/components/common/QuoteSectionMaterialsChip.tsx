import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomSheet } from "@/components/responsive/BottomSheet";
import { HEADER_CHIP } from "@/components/common/ProjectTypeChip";

/**
 * "Materials: Patio ▾" — a quote section's link to materials sheet sections,
 * as a chip in the dark section header. "Match automatically" follows the
 * project type / name match live; picking sections switches to a manual
 * choice (one, several, or none). A popover on desktop (portalled, never
 * clipped), a bottom sheet on phones; events are stopped so it can't
 * collapse/drag the section.
 */
export function QuoteSectionMaterialsChip({
  mode,
  manualIds,
  autoMatchedIds,
  sheetSections,
  onChange,
}: {
  mode: "auto" | "manual";
  manualIds: string[];
  autoMatchedIds: string[];
  sheetSections: { id: string; name: string }[];
  onChange: (next: { mode: "auto" | "manual"; ids: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const activeIds = mode === "auto" ? autoMatchedIds : manualIds.filter((id) => sheetSections.some((s) => s.id === id));
  const names = sheetSections.filter((s) => activeIds.includes(s.id)).map((s) => s.name || "Untitled section");
  const label = names.length ? names.join(", ") : "none";

  const toggle = (id: string, checked: boolean) => {
    const base = mode === "auto" ? autoMatchedIds : manualIds;
    const ids = checked ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    onChange({ mode: "manual", ids });
  };

  const panel = (
    <>
          <p className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Materials sheet sections</p>
          <button
            type="button"
            onClick={() => onChange({ mode: "auto", ids: [] })}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              mode === "auto" && "font-semibold text-primary",
            )}
          >
            Match automatically
            <span className="text-[11px] font-normal text-muted-foreground">by project type / name</span>
          </button>
          <div className="my-1 border-t border-hairline" />
          {sheetSections.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">This quote's materials sheet has no sections yet.</p>
          ) : (
            sheetSections.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={activeIds.includes(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                <span className="truncate">{s.name || "Untitled section"}</span>
              </label>
            ))
          )}
          <button
            type="button"
            onClick={() => onChange({ mode: "manual", ids: [] })}
            className={cn(
              "mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              mode === "manual" && activeIds.length === 0 && "font-semibold text-primary",
            )}
          >
            None
          </button>
    </>
  );
  // The chip; on phones it opens the bottom sheet instead of a popover.
  const chip = (onClick?: () => void) => (
          <button
            type="button"
            onClick={onClick}
            aria-label="Linked materials sheet sections"
            className={cn(
              HEADER_CHIP,
              "sm:max-w-[16rem] focus:outline-none focus:ring-2 focus:ring-primary",
              names.length
                ? "bg-white/[0.18] text-background hover:bg-white/[0.28]"
                : "border border-dashed border-white/35 text-background/70 hover:border-white/60 hover:bg-white/10 hover:text-background",
            )}
          >
            <span className="truncate">
              Materials: {label}
              {mode === "auto" && names.length > 0 ? " (auto)" : ""}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-80" />
          </button>
  );

  if (isMobile) {
    return (
      <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="inline-flex max-w-full">
        {chip(() => setOpen(true))}
        <BottomSheet open={open} onOpenChange={setOpen} title="Materials for this section">
          {panel}
        </BottomSheet>
      </span>
    );
  }

  return (
    <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="inline-flex max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{chip()}</PopoverTrigger>
        <PopoverContent align="start" className="z-50 w-64 p-2">
          {panel}
        </PopoverContent>
      </Popover>
    </span>
  );
}

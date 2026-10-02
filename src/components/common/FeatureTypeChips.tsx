import { useLayoutEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { MultiSelectPopover } from "@/components/common/MultiSelectPopover";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/api";
import { ProjectTypeList } from "@/components/common/ProjectTypeList";
import { useProjectTypeOptions } from "@/hooks/use-project-type-options";

const MAX_ROWS = 3;
const CHIP =
  "inline-flex h-7 items-center rounded-full bg-muted px-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/70";

/**
 * A job's features (project types) as a compact inline row: a small
 * "Features" label, the chips, and an Edit icon. Clicking a chip or Edit
 * opens the shared multi-select (a popover on desktop, a bottom sheet on
 * phones; checkbox rows, Done) —
 * same add / remove behavior as before. Past three rows of chips it shows
 * the first ones plus "+N more". Catch-all categories ("Other /
 * Uncategorized") aren't features and are hidden — and kept as they are if
 * already set.
 */
export function FeatureTypeChips({
  value,
  onChange,
  label = "Features",
  placeholder = "Add features…",
  className,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { options } = useProjectTypeOptions();
  const byId = new Map(options.map((c) => [c.id, c]));
  const selected = value.map((id) => byId.get(id)).filter((c): c is Category => !!c);

  // Only the clicked id changes — a catch-all already in `value` is kept.
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  // How many chips fit in MAX_ROWS (with room for "+N more"): measured on an
  // invisible copy at the same width.
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number>(selected.length);
  const key = selected.map((c) => c.id).join(",");
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      const all = [...el.children] as HTMLElement[];
      const chips = all.slice(0, all.length - 2); // last two: "+N more" and the Edit icon
      if (chips.length === 0) return setFit(0);
      const rowsOf = (els: HTMLElement[]) => [...new Set(els.map((c) => c.offsetTop))].sort((a, b) => a - b);
      // everything (chips + Edit) in MAX_ROWS → show all
      if (rowsOf([...chips, all[all.length - 1]]).length <= MAX_ROWS) return setFit(chips.length);
      const limit = rowsOf(all)[MAX_ROWS];
      const inRows = chips.filter((c) => c.offsetTop < limit).length;
      setFit(Math.max(1, inRows - 1)); // room for "+N more" and Edit on the last row
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  const shown = expanded ? selected : selected.slice(0, fit);
  const hiddenCount = selected.length - shown.length;

  const row = (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{label}</span>
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.length === 0 && (
            <button type="button" onClick={() => setOpen(true)} className="h-7 text-[13px] text-muted-foreground hover:text-foreground">
              {placeholder}
            </button>
          )}
          {shown.map((c) => (
            <button key={c.id} type="button" onClick={() => setOpen(true)} className={CHIP}>
              {c.name}
            </button>
          ))}
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className={cn(CHIP, "bg-transparent text-primary ring-1 ring-inset ring-border")}>
              +{hiddenCount} more
            </button>
          )}
          {expanded && selected.length > fit && (
            <button type="button" onClick={() => setExpanded(false)} className="h-7 px-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              Show less
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Edit ${label.toLowerCase()}`}
            title={`Edit ${label.toLowerCase()}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* invisible copy at the same width — how many chips fit in MAX_ROWS */}
        <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span key={c.id} className={CHIP}>
              {c.name}
            </span>
          ))}
          <span className={CHIP}>+99 more</span>
          <span className="h-7 w-7" />
        </div>
      </div>
    </div>
  );

  return (
    <MultiSelectPopover
      open={open}
      onOpenChange={setOpen}
      title={label}
      trigger={row}
      anchor
      list={({ large, close }) => <ProjectTypeList value={value} onToggle={toggle} large={large} onDone={close} />}
    />
  );
}

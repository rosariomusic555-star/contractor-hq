import { useEffect, useState } from "react";
import { HardHat, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { cn, formatCurrency } from "@/lib/utils";
import { laborFormula, sectionLaborCost, type LaborMode } from "@/lib/costPlanMath";

export interface LaborDraft {
  labor_mode: LaborMode | null;
  labor_crew_size: number | null;
  labor_days: number | null;
  labor_hours_per_day: number | null;
  labor_rate: number | null;
  labor_lump_sum: number | null;
  labor_notes: string;
}

const LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

/**
 * The labor block at the bottom of a Cost plan section: crew × days ×
 * hours/day × rate ("3 guys × 4 days × 8 hrs × $30 = $2,880"), or one lump
 * sum. Collapsed to "+ Add labor" while empty; a tinted panel once it has
 * data. The rate starts at the contractor's default labor rate (Settings ›
 * Business profile); hours/day at 8.
 */
export function SectionLaborBlock({
  value,
  defaultRate,
  onChange,
}: {
  value: LaborDraft;
  defaultRate: number;
  onChange: (patch: Partial<LaborDraft>) => void;
}) {
  if (!value.labor_mode) {
    return (
      <button
        type="button"
        onClick={() =>
          onChange({ labor_mode: "crew", labor_hours_per_day: value.labor_hours_per_day ?? 8, labor_rate: value.labor_rate ?? defaultRate })
        }
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border text-sm font-bold text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        Add labor
      </button>
    );
  }

  const cost = sectionLaborCost(value);
  const formula = laborFormula(value);

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <HardHat className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold text-foreground">Labor</span>
        <div className="flex rounded-lg bg-card p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Labor pricing">
          {(
            [
              ["crew", "Crew × days"],
              ["lump_sum", "Lump sum"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value.labor_mode === mode}
              onClick={() =>
                onChange(
                  mode === "lump_sum"
                    ? { labor_mode: "lump_sum", labor_lump_sum: value.labor_lump_sum ?? (cost || null) }
                    : { labor_mode: "crew", labor_hours_per_day: value.labor_hours_per_day ?? 8, labor_rate: value.labor_rate ?? defaultRate },
                )
              }
              className={cn("min-h-9 rounded-md px-3", value.labor_mode === mode ? "bg-primary/15 text-foreground" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-base font-extrabold tabular-nums text-foreground">{formatCurrency(cost)}</span>
        <button
          type="button"
          onClick={() =>
            onChange({
              labor_mode: null,
              labor_crew_size: null,
              labor_days: null,
              labor_hours_per_day: null,
              labor_rate: null,
              labor_lump_sum: null,
              labor_notes: "",
            })
          }
          aria-label="Remove labor"
          title="Remove labor"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {value.labor_mode === "crew" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumInput label="Crew size" suffix="people" value={value.labor_crew_size} onChange={(v) => onChange({ labor_crew_size: v })} />
          <NumInput label="Days" value={value.labor_days} onChange={(v) => onChange({ labor_days: v })} />
          <NumInput label="Hours / day" value={value.labor_hours_per_day} onChange={(v) => onChange({ labor_hours_per_day: v })} />
          <NumInput label="Rate / person" prefix="$" suffix="/hr" value={value.labor_rate} onChange={(v) => onChange({ labor_rate: v })} />
        </div>
      ) : (
        <div className="max-w-48">
          <NumInput label="Labor total" prefix="$" value={value.labor_lump_sum} onChange={(v) => onChange({ labor_lump_sum: v })} />
        </div>
      )}

      {formula && <p className="rounded-lg bg-card px-3 py-2 text-sm font-semibold tabular-nums text-foreground">{formula}</p>}

      {(value.labor_notes || value.labor_mode) && (
        <AutoGrowTextarea
          value={value.labor_notes}
          onChange={(e) => onChange({ labor_notes: e.target.value })}
          placeholder="Labor notes (optional)"
          aria-label="Labor notes"
          className="bg-card text-sm"
        />
      )}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
}) {
  // Local text so "4." can be typed; follows outside changes.
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if ((text.trim() === "" ? null : Number(text)) !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block">
      <div className={LABEL}>{label}</div>
      <div className="relative mt-1">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const t = e.target.value.trim();
            const n = Number(t);
            onChange(t === "" || !isFinite(n) ? null : n);
          }}
          className={cn("h-11 bg-card text-base", prefix && "pl-6", suffix && "pr-14")}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </label>
  );
}

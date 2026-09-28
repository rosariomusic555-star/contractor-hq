import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { getOverheadSettings, saveOverheadSettings } from "@/lib/api";
import {
  OVERHEAD_SETTINGS_DEFAULTS,
  annualAmount,
  annualOverhead,
  burdenPerCrewDay,
  burdenPerHour,
  crewDayHours,
  helperManHours,
  productiveCrewDays,
  productiveManHours,
  type OverheadSettings,
} from "@/lib/overhead";

const LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const num = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d }));

/**
 * Settings › Business › Overhead (0110): yearly overhead by category, the
 * team's productive capacity, and the overhead burden per productive
 * man-hour / crew-day that follows — the rate every quote and Cost plan
 * applies through its planned labor (never typed into a quote). Math in
 * src/lib/overhead.ts, shown here so it's never a black box.
 */
export function SettingsOverheadView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: saved, isLoading } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });

  const [draft, setDraft] = useState<OverheadSettings>(OVERHEAD_SETTINGS_DEFAULTS);
  const dirty = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const seed = () => ({ ...OVERHEAD_SETTINGS_DEFAULTS, ...(saved ?? {}) });
  useEffect(() => {
    if (dirty.current || isLoading) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, isLoading]);

  const edit = (patch: Partial<OverheadSettings>) => {
    dirty.current = true;
    setIsDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const editItem = (i: number, patch: Partial<OverheadSettings["items"][number]>) =>
    edit({ items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  const saveMut = useMutation({
    mutationFn: () => saveOverheadSettings({ ...draft, items: draft.items.filter((i) => i.label.trim() || i.amount) }),
    onSuccess: () => {
      dirty.current = false;
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ["overhead-settings"] });
      toast({ title: "Overhead saved", description: "New quotes use this rate; drafts can recalculate." });
    },
    onError: (err: Error) => toast({ title: "Couldn't save overhead", description: err.message, variant: "destructive" }),
  });
  const discard = () => {
    dirty.current = false;
    setIsDirty(false);
    setDraft(seed());
  };

  const annual = annualOverhead(draft);
  const helper = helperManHours(draft);
  const hours = productiveManHours(draft);
  const crewDays = productiveCrewDays(draft);
  const perHour = burdenPerHour(draft);
  const perCrewDay = burdenPerCrewDay(draft);
  const dayHours = crewDayHours(draft);
  const usingManual = !!(draft.manual_man_hours && draft.manual_man_hours > 0) || !!(draft.manual_crew_days && draft.manual_crew_days > 0);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Overhead" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Overhead</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set it once — every quote and Cost plan applies it automatically through planned labor. Internal only; clients never see
          it.
        </p>
      </div>

      {/* 1 · Yearly overhead */}
      <section className="card-surface space-y-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <h2 className="text-base font-bold text-foreground">Yearly overhead</h2>
        </div>
        <div className="divide-y divide-hairline">
          {draft.items.map((it, i) => (
            <div key={it.key} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 py-2.5 sm:grid-cols-[1fr_8rem_auto_6.5rem_2.25rem]">
              <Input
                value={it.label}
                onChange={(e) => editItem(i, { label: e.target.value })}
                aria-label="Overhead item"
                className="col-span-2 h-10 font-semibold sm:col-span-1"
              />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  inputMode="decimal"
                  value={it.amount ?? ""}
                  onChange={(e) => editItem(i, { amount: e.target.value.trim() === "" ? null : Number(e.target.value) || 0 })}
                  aria-label={`${it.label} amount`}
                  className="h-10 pl-6 tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold" role="radiogroup" aria-label={`${it.label} period`}>
                {(["month", "year"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={it.period === p}
                    onClick={() => editItem(i, { period: p })}
                    className={cn("min-h-9 rounded-md px-2.5", it.period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                  >
                    {p === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
              <span className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(annualAmount(it))}/yr</span>
              <button
                type="button"
                onClick={() => edit({ items: draft.items.filter((_, j) => j !== i) })}
                aria-label={`Remove ${it.label}`}
                className="flex h-9 w-9 items-center justify-center justify-self-end rounded-md text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => edit({ items: [...draft.items, { key: crypto.randomUUID(), label: "", amount: null, period: "month" }] })}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border text-sm font-bold text-primary hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add a row
        </button>
        <div className="flex items-center justify-between border-t border-hairline pt-3">
          <span className="text-sm font-bold text-foreground">Total annual overhead</span>
          <span className="text-lg font-extrabold tabular-nums text-foreground">{formatCurrency(annual)}</span>
        </div>
      </section>

      {/* 2 · Productive capacity */}
      <section className="card-surface space-y-4 p-5">
        <h2 className="text-base font-bold text-foreground">Productive capacity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Num label="Field workers" value={draft.field_workers} onChange={(v) => edit({ field_workers: v })} />
          <Num label="Weeks / year" value={draft.weeks_per_year} onChange={(v) => edit({ weeks_per_year: v })} />
          <Num label="Days / week" value={draft.days_per_week} onChange={(v) => edit({ days_per_week: v })} />
          <Num label="Hours / day" value={draft.hours_per_day} onChange={(v) => edit({ hours_per_day: v })} />
          <Num label="Utilization" suffix="%" value={draft.utilization_pct} onChange={(v) => edit({ utilization_pct: v })} />
        </div>
        <p className={cn("rounded-lg bg-muted/60 px-3 py-2 text-sm tabular-nums", usingManual ? "text-muted-foreground line-through" : "text-foreground")}>
          {helper != null
            ? `${num(draft.field_workers)} × ${num(draft.weeks_per_year)} wk × ${num(draft.days_per_week)} d × ${num(draft.hours_per_day)} h × ${num(draft.utilization_pct)}% = ${num(helper)} productive man-hours / year`
            : "Fill in every field to work out productive man-hours"}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Crew size" value={draft.crew_size} onChange={(v) => edit({ crew_size: v ?? 3 })} />
          <Num label="Or: man-hours / year" value={draft.manual_man_hours} onChange={(v) => edit({ manual_man_hours: v, manual_crew_days: null })} />
          <Num label="Or: crew-days / year" value={draft.manual_crew_days} onChange={(v) => edit({ manual_crew_days: v, manual_man_hours: null })} />
        </div>
        <p className="text-xs text-muted-foreground">
          A crew-day = crew size × hours/day = {num(dayHours)} man-hours. Typing man-hours or crew-days here replaces the helper.
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline pt-3">
          <span className="text-sm font-bold text-foreground">Productive capacity</span>
          <span className="text-sm font-bold tabular-nums text-foreground">
            {num(hours)} man-hours · {num(crewDays, 1)} crew-days / year
          </span>
        </div>
      </section>

      {/* 3 · Burden */}
      <section className="card-surface space-y-3 p-5">
        <h2 className="text-base font-bold text-foreground">Overhead burden</h2>
        {perHour != null ? (
          <>
            <p className="text-sm tabular-nums text-foreground">
              {formatCurrency(annual)} ÷ {num(hours)} productive hours = <strong>{formatCurrency(perHour)}/hr</strong>
            </p>
            <p className="text-sm tabular-nums text-foreground">
              {formatCurrency(perHour)}/hr × {num(dayHours)} man-hours = <strong>{formatCurrency(perCrewDay ?? 0)} per crew-day</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Added to every job through its planned labor: planned man-hours × {formatCurrency(perHour)}.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Enter your overhead and capacity above to see the rate.</p>
        )}
      </section>

      {/* 4 · Preferences */}
      <section className="card-surface space-y-4 p-5">
        <h2 className="text-base font-bold text-foreground">Preferences</h2>
        <div>
          <div className={LABEL}>Show labor and overhead in</div>
          <div className="mt-1.5 inline-flex rounded-lg bg-muted p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Labor unit">
            {(
              [
                ["hours", "Hours"],
                ["crew_days", "Crew-days"],
              ] as const
            ).map(([u, l]) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={draft.display_unit === u}
                onClick={() => edit({ display_unit: u })}
                className={cn("min-h-10 rounded-md px-4", draft.display_unit === u ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-[12rem]">
          <Num label="Target margin" suffix="%" value={draft.target_margin_pct} onChange={(v) => edit({ target_margin_pct: v })} />
          <p className="mt-1 text-xs text-muted-foreground">After overhead — used for the required selling price.</p>
        </div>
      </section>

      <DraftSaveBar visible={isDirty} onDiscard={discard} onSave={() => saveMut.mutate()} saving={saveMut.isPending} />
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    const parsed = text.trim() === "" ? null : Number(text);
    if (parsed !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block min-w-0">
      <div className={LABEL}>{label}</div>
      <div className="relative mt-1">
        <Input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const t = e.target.value.trim();
            const n = Number(t);
            onChange(t === "" || !isFinite(n) ? null : n);
          }}
          className={cn("h-10 tabular-nums", suffix && "pr-7")}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

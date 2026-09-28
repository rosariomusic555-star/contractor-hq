import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/common/DecimalInput";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { getPayrollSettings, savePayrollSettings, type PayrollSettings } from "@/lib/api";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Settings › Payroll & time (0131): pay period, overtime rules, payroll
 * burden (job costing only), rounding, auto-deduct lunch. Saving re-costs
 * every timesheet that isn't approved yet; approved ones never change.
 */
export function SettingsPayrollView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["payroll-settings"], queryFn: getPayrollSettings });
  const [d, setD] = useState<PayrollSettings | null>(null);
  useEffect(() => {
    if (data) setD(data);
  }, [data]);
  const save = useMutation({
    mutationFn: savePayrollSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-settings"] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      qc.invalidateQueries({ queryKey: ["labor-entries"] });
      toast({ title: "Saved — open timesheets were re-costed" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  if (!d) return null;

  const field = (label: string, value: number | null, onChange: (v: number | null) => void, hint?: string, opts: { suffix?: string; optional?: boolean } = {}) => (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <DecimalInput
          value={value}
          placeholder={opts.optional ? "Off" : undefined}
          onChange={(v) => onChange(v == null && !opts.optional ? NaN : v)}
          className="h-10 w-24"
        />
        {opts.suffix && <span className="text-sm text-muted-foreground">{opts.suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] text-muted-subtle">{hint}</span>}
    </label>
  );
  const valid =
    d.ot_weekly_hours > 0 &&
    (d.ot_daily_hours == null || d.ot_daily_hours > 0) &&
    d.ot_multiplier >= 1 &&
    d.ot_multiplier <= 3 &&
    d.ot_weekly_hours <= 168 &&
    (d.ot_daily_hours == null || d.ot_daily_hours <= 24) &&
    d.long_day_hours <= 24 &&
    d.burden_pct >= 0 &&
    d.burden_pct <= 100 &&
    d.lunch_after_hours > 0 &&
    d.lunch_minutes >= 1 &&
    d.long_day_hours > 0;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Payroll & time" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Payroll & time</h1>
      </div>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Pay period</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Pay period</span>
            <Select value={d.period_type} onValueChange={(v) => setD({ ...d, period_type: v as PayrollSettings["period_type"] })}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every two weeks</SelectItem>
                <SelectItem value="semimonthly">Twice a month (1st–15th, 16th–end)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Week starts on</span>
            <Select value={String(d.week_start)} onValueChange={(v) => setD({ ...d, week_start: Number(v) })}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((x, i) => (
                  <SelectItem key={x} value={String(i)}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="mt-1 block text-[11px] text-muted-subtle">Also the overtime week.</span>
          </label>
          {d.period_type === "biweekly" && (
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">A pay period started on</span>
              <Input type="date" value={d.biweekly_anchor ?? ""} onChange={(e) => setD({ ...d, biweekly_anchor: e.target.value || null })} className="mt-1 h-10 w-44" />
              <span className="mt-1 block text-[11px] text-muted-subtle">Any past period start — sets which weeks pair up.</span>
            </label>
          )}
        </div>
      </section>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Overtime</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Weekly overtime after", d.ot_weekly_hours, (v) => setD({ ...d, ot_weekly_hours: v ?? NaN }), undefined, { suffix: "hrs" })}
          {field("Daily overtime after", d.ot_daily_hours, (v) => setD({ ...d, ot_daily_hours: v }), "Only if your state requires it (e.g. 8 hrs).", { suffix: "hrs", optional: true })}
          {field("Overtime pay", d.ot_multiplier, (v) => setD({ ...d, ot_multiplier: v ?? NaN }), undefined, { suffix: "× rate" })}
        </div>
      </section>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Job costing</h2>
        {field(
          "Payroll burden",
          d.burden_pct,
          (v) => setD({ ...d, burden_pct: v ?? NaN }),
          "Employer taxes, workers' comp, etc. Added to labor cost on jobs — never to what employees are paid.",
          { suffix: "%" },
        )}
      </section>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Time rules</h2>
        <label className="block max-w-xs">
          <span className="text-xs font-semibold text-muted-foreground">Round clock times</span>
          <Select value={String(d.rounding_minutes)} onValueChange={(v) => setD({ ...d, rounding_minutes: Number(v) as 0 | 5 | 15 })}>
            <SelectTrigger className="mt-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">No rounding</SelectItem>
              <SelectItem value="5">Nearest 5 minutes</SelectItem>
              <SelectItem value="15">Nearest 15 minutes</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold text-foreground">Auto-deduct an unpaid lunch</span>
            <span className="block text-xs text-muted-foreground">Only on days with no break entered.</span>
          </span>
          <Switch checked={d.lunch_enabled} onCheckedChange={(v) => setD({ ...d, lunch_enabled: v })} />
        </label>
        {d.lunch_enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Deduct", d.lunch_minutes, (v) => setD({ ...d, lunch_minutes: v ?? NaN }), undefined, { suffix: "minutes" })}
            {field("On days longer than", d.lunch_after_hours, (v) => setD({ ...d, lunch_after_hours: v ?? NaN }), undefined, { suffix: "hrs" })}
          </div>
        )}
        {field("Flag a long day over", d.long_day_hours, (v) => setD({ ...d, long_day_hours: v ?? NaN }), "Employees explain it before submitting.", { suffix: "hrs" })}
      </section>

      <div className="flex justify-end">
        <Button disabled={!valid || save.isPending || JSON.stringify(d) === JSON.stringify(data)} onClick={() => save.mutate(d)}>
          Save
        </Button>
      </div>
    </div>
  );
}

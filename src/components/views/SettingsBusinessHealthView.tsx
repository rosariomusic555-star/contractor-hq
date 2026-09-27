import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addHoliday,
  deleteHoliday,
  getBusinessHealthSettings,
  listCrewsWithWorkDays,
  listHolidays,
  saveBusinessHealthSettings,
  saveCrew,
  setCrewWorkDays,
  type BusinessHealthSettings,
} from "@/lib/api";
import { opportunityStageMeta } from "@/lib/statusMeta";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Settings › Business health (0132): invoice payment terms (projected
 * billing), per-stage win probabilities (weighted pipeline), business
 * holidays and each crew's working days (capacity).
 */
export function SettingsBusinessHealthView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const onError = (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
  const { data: settings } = useQuery({ queryKey: ["business-health-settings"], queryFn: getBusinessHealthSettings });
  const { data: crews = [] } = useQuery({ queryKey: ["crews-work-days"], queryFn: listCrewsWithWorkDays });
  const { data: holidays = [] } = useQuery({ queryKey: ["holidays"], queryFn: listHolidays });
  const [d, setD] = useState<BusinessHealthSettings | null>(null);
  useEffect(() => {
    if (settings) setD(settings);
  }, [settings]);
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");
  const [crewName, setCrewName] = useState("");

  const save = useMutation({
    mutationFn: saveBusinessHealthSettings,
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["business-health-settings"] }), toast({ title: "Saved" })),
    onError,
  });
  const refreshCrews = () => qc.invalidateQueries({ queryKey: ["crews-work-days"] });
  const days = useMutation({ mutationFn: ({ id, wd }: { id: string; wd: number[] }) => setCrewWorkDays(id, wd), onSuccess: refreshCrews, onError });
  const addCrew = useMutation({ mutationFn: () => saveCrew({ name: crewName.trim(), sort_order: crews.length }), onSuccess: () => (setCrewName(""), refreshCrews(), qc.invalidateQueries({ queryKey: ["crews"] })), onError });
  const refreshHolidays = () => qc.invalidateQueries({ queryKey: ["holidays"] });
  const addH = useMutation({ mutationFn: () => addHoliday(hDate, hName), onSuccess: () => (setHDate(""), setHName(""), refreshHolidays()), onError });
  const delH = useMutation({ mutationFn: deleteHoliday, onSuccess: refreshHolidays, onError });

  if (!d) return null;
  const valid = d.invoice_due_days >= 0 && d.invoice_due_days <= 120 && Object.values(d.stage_probabilities).every((v) => v >= 0 && v <= 100);
  const upcoming = holidays.filter((h) => h.date >= new Date().toISOString().slice(0, 10));

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Business health" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Business health</h1>
      </div>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Cash forecast & pipeline</h2>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Clients pay invoices within</span>
          <span className="mt-1 flex items-center gap-1.5">
            <Input inputMode="numeric" value={String(d.invoice_due_days)} onChange={(e) => setD({ ...d, invoice_due_days: Math.floor(Number(e.target.value) || 0) })} className="h-10 w-20" />
            <span className="text-sm text-muted-foreground">days</span>
          </span>
          <span className="mt-1 block text-[11px] text-muted-subtle">Used to project when a job's deposit and final payment will come in.</span>
        </label>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Chance an open lead in each stage becomes a job</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(d.stage_probabilities).map(([stage, v]) => (
              <label key={stage} className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2 text-sm">
                {opportunityStageMeta(stage as never).label}
                <span className="flex items-center gap-1">
                  <Input
                    inputMode="numeric"
                    value={String(v)}
                    onChange={(e) => setD({ ...d, stage_probabilities: { ...d.stage_probabilities, [stage]: Math.min(100, Math.max(0, Math.floor(Number(e.target.value) || 0))) } })}
                    className="h-9 w-16 text-right"
                  />
                  %
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={!valid || save.isPending || JSON.stringify(d) === JSON.stringify(settings)} onClick={() => save.mutate(d)}>
            Save
          </Button>
        </div>
      </section>

      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Crews & working days</h2>
        <p className="text-xs text-muted-foreground">Capacity = each crew's working days, minus holidays. Assign a crew on each job's Schedule card.</p>
        <ul className="divide-y divide-hairline">
          {crews.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="font-semibold text-foreground">{c.name}</span>
              <span className="flex gap-1">
                {DAYS.map((label, i) => {
                  const on = c.work_days.includes(i);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => days.mutate({ id: c.id, wd: on ? c.work_days.filter((x) => x !== i) : [...c.work_days, i] })}
                      className={cn("h-9 w-10 rounded-md border text-xs font-semibold", on ? "border-primary bg-primary/15 text-foreground" : "border-hairline text-muted-foreground")}
                    >
                      {label}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
          {crews.length === 0 && <li className="py-2 text-sm text-muted-foreground">No crews yet.</li>}
        </ul>
        <div className="flex gap-2">
          <Input value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="New crew, e.g. Crew B" className="h-10" />
          <Button className="h-10" disabled={!crewName.trim() || addCrew.isPending} onClick={() => addCrew.mutate()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Holidays</h2>
        <p className="text-xs text-muted-foreground">Days nobody works — they don't count as available capacity.</p>
        <ul className="divide-y divide-hairline">
          {upcoming.map((h) => (
            <li key={h.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-28 tabular-nums text-muted-foreground">{h.date}</span>
              <span className="flex-1">{h.name}</span>
              <button type="button" onClick={() => delH.mutate(h.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${h.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {upcoming.length === 0 && <li className="py-2 text-sm text-muted-foreground">No upcoming holidays.</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} className="h-10 w-44" />
          <Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Name, e.g. Thanksgiving" className="h-10 min-w-0 flex-1" />
          <Button className="h-10" disabled={!hDate || addH.isPending} onClick={() => addH.mutate()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </section>
    </div>
  );
}

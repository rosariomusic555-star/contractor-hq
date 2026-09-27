import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Package, Truck } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_TYPE_LABEL,
  applyScheduleDelay,
  getProject,
  getPreconSettings,
  listLocateItems,
  listAppointments,
  listCrews,
  listMaterialOrders,
  listProjects,
  type ScheduleDelayDelivery,
} from "@/lib/api";
import {
  DELAY_REASON_LABEL,
  addWorkingDays,
  changeSummary,
  delayDayLabel,
  planDelay,
  type DelayJob,
  type DelayReason,
} from "@/lib/scheduleShift";
import { isoDate } from "@/lib/weatherRisk";
import { locateDelayWarning } from "@/lib/precon";
import { invalidateScheduleQueries, useUndoScheduleDelay } from "./useUndoScheduleDelay";
import { HeadsUpStep } from "./HeadsUpStep";

const REASONS: DelayReason[] = ["rain", "weather_other", "material", "client", "other"];
const ACTIVE = new Set(["scheduled", "in_progress"]);

/** Every working day between a change's old and new dates that the job no
 * longer occupies (for deliveries / appointments on the moved days). */
function vacatedDays(from: { start: string | null; end: string | null }, to: { start: string | null; end: string | null }, lost: string[] | null): string[] {
  if (lost) return lost;
  if (!from.start || !to.start || to.start <= from.start) return [];
  const out: string[] = [];
  for (let d = from.start; d < to.start; d = addWorkingDays(d, 1)) out.push(d);
  return out;
}

/**
 * Rain delay action (0120). Push a job N working days from a flagged (or
 * any) work day, optionally cascading the same crew's later jobs; preview
 * every date that moves, warnings, deliveries and appointments on the moved
 * days, then apply atomically. Bottom sheet on phones.
 */
export function RainDelaySheet({
  open,
  onOpenChange,
  projectId,
  date,
  defaultReason = "rain",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** The flagged / chosen work day (ISO). */
  date: string;
  defaultReason?: DelayReason;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { session } = useAuth();
  const undo = useUndoScheduleDelay();

  const [day, setDay] = useState(date);
  const [preset, setPreset] = useState<"1" | "2" | "custom">("1");
  const [custom, setCustom] = useState("3");
  const [reason, setReason] = useState<DelayReason>(defaultReason);
  const [note, setNote] = useState("");
  const [cascade, setCascade] = useState(true);
  const [moveDeliveries, setMoveDeliveries] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ delayId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDay(date);
    setPreset("1");
    setReason(defaultReason);
    setNote("");
    setCascade(true);
    setMoveDeliveries(new Set());
    setDone(null);
  }, [open, date, defaultReason]);

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(), enabled: open });
  const { data: fallbackProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: open && !projects.some((p) => p.id === projectId),
  });
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews, enabled: open });
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders(), enabled: open });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments, enabled: open });

  const project = projects.find((p) => p.id === projectId) ?? fallbackProject;
  const crew = crews.find((c) => c.id === project?.crew_id) ?? null;
  const days = preset === "custom" ? Math.max(0, Math.floor(Number(custom) || 0)) : Number(preset);
  const daysValid = days >= 1 && days <= 60;

  const plan = useMemo(() => {
    if (!project?.scheduled_start_date || !daysValid) return null;
    const toJob = (p: typeof project): DelayJob => ({
      id: p.id,
      name: p.name,
      clientName: p.client?.name ?? null,
      crewId: p.crew_id ?? null,
      start: p.scheduled_start_date,
      end: p.scheduled_end_date,
      started: !!p.actual_start_date || p.status === "in_progress",
    });
    return planDelay({
      primary: toJob(project),
      delayDate: day,
      days,
      cascade,
      otherJobs: projects.filter((p) => p.id !== project.id && ACTIVE.has(p.status)).map(toJob),
    });
  }, [project, projects, day, days, cascade, daysValid]);

  // Deliveries / appointments on the days each moved job vacates.
  const affected = useMemo(() => {
    if (!plan) return { deliveries: [], appts: [] as { id: string; label: string; when: string; oppId: string | null; project: string }[] };
    const deliveries: (ScheduleDelayDelivery & { supplier: string })[] = [];
    const appts: { id: string; label: string; when: string; oppId: string | null; project: string }[] = [];
    for (const c of plan.changes) {
      const vac = new Set(vacatedDays(c.from, c.to, c.role === "primary" ? plan.lostDays : null));
      if (vac.size === 0) continue;
      for (const o of orders) {
        if (o.project_id !== c.projectId || o.status === "delivered" || !o.expected_delivery_date) continue;
        if (!vac.has(o.expected_delivery_date)) continue;
        deliveries.push({
          order_id: o.id,
          project_id: c.projectId,
          label: `${o.supplier ?? "Delivery"} (${c.name})`,
          supplier: o.supplier ?? "Delivery",
          from: o.expected_delivery_date,
          to: addWorkingDays(o.expected_delivery_date, c.shiftDays),
        });
      }
      const p = projects.find((x) => x.id === c.projectId) ?? (c.projectId === projectId ? project : undefined);
      const oppIds = new Set((p?.opportunities ?? []).map((o) => o.id));
      for (const a of appointments) {
        if (a.status !== "scheduled" || !a.opportunity_id || !oppIds.has(a.opportunity_id)) continue;
        if (!vac.has(isoDate(new Date(a.date_time)))) continue;
        appts.push({
          id: a.id,
          label: APPOINTMENT_TYPE_LABEL[a.type],
          when: new Date(a.date_time).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: a.all_day ? undefined : "numeric", minute: a.all_day ? undefined : "2-digit" }),
          oppId: a.opportunity_id,
          project: c.name,
        });
      }
    }
    return { deliveries, appts };
  }, [plan, orders, appointments, projects, project, projectId]);

  // Pre-construction (0124): would the new dates outrun an 811 ticket?
  const changedIds = (plan?.changes ?? []).map((c) => c.projectId);
  const { data: locates = [] } = useQuery({
    queryKey: ["precon-locates", changedIds.join(",")],
    queryFn: () => listLocateItems(changedIds),
    enabled: open && changedIds.length > 0,
  });
  const { data: preconSettings } = useQuery({ queryKey: ["precon-settings"], queryFn: getPreconSettings, enabled: open });
  const locateWarnings = (plan?.changes ?? [])
    .map((c) => {
      const l = locates.find((x) => x.project_id === c.projectId && x.status !== "na");
      const w = l && preconSettings ? locateDelayWarning(l.details, c.to.end ?? c.to.start, preconSettings) : null;
      return w ? `${c.name}: ${w}` : null;
    })
    .filter(Boolean) as string[];

  const apply = useMutation({
    mutationFn: async () => {
      if (!plan || !project) throw new Error("Nothing to apply.");
      const toRow = (c: (typeof plan.changes)[number]) => ({
        project_id: c.projectId,
        name: c.name,
        client_name: c.clientName,
        role: c.role,
        shift_days: c.shiftDays,
        from: c.from,
        to: c.to,
      });
      return applyScheduleDelay({
        project_id: project.id,
        project_name: project.name,
        delay_date: day,
        days,
        reason,
        note: note.trim() || null,
        mode: plan.mode,
        crew_name: crew?.name ?? null,
        changes: plan.changes.map(toRow),
        deliveries: affected.deliveries.filter((d) => moveDeliveries.has(d.order_id)).map(({ supplier: _s, ...d }) => d),
        created_by_name: session?.user.email ?? null,
      });
    },
    onSuccess: (delayId) => {
      invalidateScheduleQueries(qc);
      const moved = plan?.changes.length ?? 0;
      toast({
        title: `${project?.name} ${plan?.mode === "extend" ? "extended" : "pushed"} ${days} working day${days === 1 ? "" : "s"}`,
        description: moved > 1 ? `${moved - 1} more ${crew?.name ?? "crew"} job${moved - 1 === 1 ? "" : "s"} shifted` : undefined,
        action: undo.toastAction(delayId),
      });
      setDone({ delayId });
    },
    onError: (err: Error) => toast({ title: "Couldn't apply the delay", description: err.message, variant: "destructive" }),
  });

  const primary = plan?.changes[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[92vh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle>{done ? "Delay applied" : "Delay this job"}</SheetTitle>
          <SheetDescription className="truncate">
            {project?.name ?? "…"}
            {crew ? ` · ${crew.name}` : ""}
          </SheetDescription>
        </SheetHeader>

        {done ? (
          <HeadsUpStep scope={{ delayId: done.delayId }} onDone={() => onOpenChange(false)} />
        ) : !project ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : !project.scheduled_start_date ? (
          <p className="p-5 text-sm text-muted-foreground">This job isn't scheduled yet.</p>
        ) : (
          <div className="flex-1 space-y-5 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="delay-day" className="text-xs font-semibold text-muted-foreground">
                  Day affected
                </Label>
                <Input id="delay-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Delay by (working days)</span>
                <div className="flex gap-1.5">
                  {(["1", "2"] as const).map((v) => (
                    <Button key={v} type="button" size="sm" variant={preset === v ? "default" : "outline"} className="h-10 flex-1" onClick={() => setPreset(v)}>
                      {v}
                    </Button>
                  ))}
                  {preset === "custom" ? (
                    <Input autoFocus inputMode="numeric" aria-label="Custom working days" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-10 w-16" />
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-10 flex-1" onClick={() => setPreset("custom")}>
                      Other
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Reason</span>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      reason === r ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {DELAY_REASON_LABEL[r]}
                  </button>
                ))}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} className="mt-1.5" />
            </div>

            {project.crew_id ? (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-sm font-semibold text-foreground">Shift {crew?.name ?? "this crew"}'s jobs behind it</span>
                  <span className="block text-xs text-muted-foreground">Only as much as needed to avoid overlap</span>
                </span>
                <Switch checked={cascade} onCheckedChange={setCascade} />
              </label>
            ) : (
              <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                No crew assigned to this job, so no other jobs are shifted. Assign a crew on the Schedule card to cascade.
              </p>
            )}

            {/* Preview */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Preview</h3>
              {!daysValid ? (
                <p className="text-xs text-destructive">Enter 1–60 working days.</p>
              ) : plan && primary ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-subtle">
                    {plan.mode === "extend" ? "In progress — end extended" : "Not started — start and end move"}
                  </p>
                  <ul className="divide-y divide-hairline rounded-xl border border-border">
                    {plan.changes.map((c) => (
                      <li key={c.projectId} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-bold text-foreground">{c.name}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                            {c.role === "primary" ? "This job" : `+${c.shiftDays} day${c.shiftDays === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{changeSummary(c)}</p>
                      </li>
                    ))}
                  </ul>
                  {locateWarnings.map((w) => (
                    <p key={w} className="flex items-start gap-1.5 text-xs font-semibold text-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {w}
                    </p>
                  ))}
                  {plan.warnings.length > 0 && (
                    <ul className="space-y-1">
                      {plan.warnings.map((w) => (
                        <li key={w.projectId} className="flex items-start gap-1.5 text-xs font-semibold text-warning">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {w.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </section>

            {affected.deliveries.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Truck className="h-4 w-4" /> Deliveries on the moved days
                </h3>
                <p className="text-xs text-muted-foreground">Left as-is unless you tick them — call the supplier first.</p>
                {affected.deliveries.map((d) => (
                  <label key={d.order_id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
                    <Checkbox
                      checked={moveDeliveries.has(d.order_id)}
                      onCheckedChange={(v) =>
                        setMoveDeliveries((s) => {
                          const n = new Set(s);
                          if (v === true) n.add(d.order_id);
                          else n.delete(d.order_id);
                          return n;
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="flex items-center gap-1 font-semibold text-foreground">
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{d.label}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Also move delivery date · {delayDayLabel(d.from)} → {delayDayLabel(d.to)}
                      </span>
                    </span>
                  </label>
                ))}
              </section>
            )}

            {affected.appts.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <CalendarClock className="h-4 w-4" /> Appointments on the moved days
                </h3>
                <p className="text-xs text-muted-foreground">Not moved automatically.</p>
                {affected.appts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{a.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.when} · {a.project}
                      </span>
                    </span>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link to={a.oppId ? `/pipeline/${a.oppId}` : "/appointments"} onClick={() => onOpenChange(false)}>
                        Reschedule
                      </Link>
                    </Button>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {!done && project?.scheduled_start_date && (
          <div className="sticky bottom-0 flex gap-2 border-t border-hairline bg-background px-5 py-3">
            <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="h-11 flex-1 font-bold" disabled={!plan || !daysValid || apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? "Applying…" : "Confirm delay"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

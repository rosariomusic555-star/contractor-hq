import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  approveTimesheet,
  deleteLaborEntry,
  getPayrollSettings,
  getTimesheet,
  listProjects,
  listRainDays,
  listTimesheetEvents,
  ownerSaveTimeEntry,
  rejectTimesheet,
  unlockTimesheet,
  type TimesheetEntry,
  type TimesheetEvent,
} from "@/lib/api";
import {
  TIMESHEET_STATUS,
  dayLabel,
  dayTotals,
  fmtClock,
  fmtHours,
  isoDay,
  payrollRow,
  periodDays,
  periodTotals,
  timesheetEntries,
  timesheetFlags,
  toTimeInput,
} from "@/lib/timesheets";
import { TimeEntryDialog, type EntryDraft } from "./TimeEntryDialog";

const shortRange = (a: string, b: string) => `${dayLabel(a).split(", ").slice(1).join(", ")} – ${dayLabel(b).split(", ").slice(1).join(", ")}`;

/**
 * Review one timesheet (0131, owner): entries by day with the regular /
 * overtime split, rate and job cost; flags with the employee's
 * explanations; edit (logged), Approve, Reject with a comment, Unlock
 * (logged); the full activity log.
 */
export function TimesheetDetailView() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = isoDay(new Date());
  const { data: ts, isLoading } = useQuery({ queryKey: ["timesheet", id], queryFn: () => getTimesheet(id) });
  const { data: events = [] } = useQuery({ queryKey: ["timesheet-events", id], queryFn: () => listTimesheetEvents(id) });
  const { data: settings } = useQuery({ queryKey: ["payroll-settings"], queryFn: getPayrollSettings });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: rain = [] } = useQuery({ queryKey: ["rain-days", ts?.period_start, ts?.period_end], queryFn: () => listRainDays(ts!.period_start, ts!.period_end), enabled: !!ts });
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [dialog, setDialog] = useState<"reject" | "unlock" | null>(null);
  const [comment, setComment] = useState("");

  const entries = useMemo(() => (ts ? timesheetEntries(ts) : []), [ts]);
  const flags = useMemo(() => timesheetFlags(entries, { today, longDayHours: settings?.long_day_hours ?? 12, rainDays: rain }), [entries, today, settings, rain]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["timesheet", id] });
    qc.invalidateQueries({ queryKey: ["timesheet-events", id] });
    qc.invalidateQueries({ queryKey: ["timesheets"] });
    qc.invalidateQueries({ queryKey: ["labor-entries"] });
  };
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const act = useMutation({
    mutationFn: async (kind: "approve" | "reject" | "unlock") => {
      if (kind === "approve") await approveTimesheet(id);
      else if (kind === "reject") await rejectTimesheet(id, comment);
      else await unlockTimesheet(id, comment);
    },
    onSuccess: (_d, kind) => {
      setDialog(null);
      setComment("");
      refresh();
      toast({ title: kind === "approve" ? "Approved and locked" : kind === "reject" ? "Sent back to the employee" : "Unlocked" });
    },
    onError,
  });
  const save = useMutation({
    mutationFn: (d: EntryDraft & { start_at: string; end_at: string | null }) =>
      ownerSaveTimeEntry({ id: d.id, employee_id: ts!.employee_id, worker_name: ts!.employee?.name ?? "", project_id: d.project_id, date: d.date, start_at: d.start_at, end_at: d.end_at, break_minutes: d.break_minutes, note: d.note.trim() || null }),
    onSuccess: () => (setEditing(null), refresh()),
    onError,
  });
  const del = useMutation({ mutationFn: (eid: string) => deleteLaborEntry(eid), onSuccess: () => (setEditing(null), refresh()), onError });

  if (isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!ts) return <p className="p-6 text-muted-foreground">Timesheet not found.</p>;

  const locked = ts.status === "approved";
  const st = TIMESHEET_STATUS[ts.status];
  const totals = periodTotals(entries);
  const byDay = dayTotals(entries);
  const raw = (ts.entries ?? []) as TimesheetEntry[];
  const pay = payrollRow(ts.employee_id, ts.employee?.name ?? "", raw.map((e) => ({ ...e, hours: Number(e.hours), reg_hours: e.reg_hours ?? null, ot_hours: e.ot_hours ?? null })), settings?.ot_multiplier ?? 1.5);
  const jobCost = raw.reduce((s, e) => s + Number(e.cost ?? 0), 0);
  const flagged = new Set(flags.flatMap((f) => f.entryIds));
  const projectOptions = [...projects.map((p) => ({ id: p.id, name: p.name })), ...raw.filter((e) => !projects.some((p) => p.id === e.project_id)).map((e) => ({ id: e.project_id, name: e.project?.name ?? "Project" }))];

  const openEdit = (e: TimesheetEntry) =>
    e.start_at
      ? setEditing({ id: e.id, project_id: e.project_id, date: e.entry_date, start: toTimeInput(e.start_at), end: toTimeInput(e.end_at ?? null), break_minutes: e.break_minutes ?? 0, note: e.note ?? "" })
      : toast({ title: "Hours-only entry", description: "Edit it on the project's Labor page." });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-4 pb-24">
      <MobilePageHeader title={ts.employee?.name ?? "Timesheet"} back={{ to: "/timesheets", label: "Timesheets" }} />
      <div className="hidden md:block">
        <BackLink to="/timesheets" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Timesheets
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">{ts.employee?.name}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-foreground">{shortRange(ts.period_start, ts.period_end)}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", st.tone)}>{st.label}</span>
        {locked && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Locked{ts.approved_by ? ` · approved by ${ts.approved_by}` : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Regular", fmtHours(totals.reg)],
          ["Overtime", fmtHours(totals.ot)],
          ["Est. gross pay", pay.missingRate ? "Rate missing" : formatCurrency(pay.gross)],
          [settings?.burden_pct ? `Job cost (+${settings.burden_pct}%)` : "Job cost", formatCurrency(jobCost)],
        ].map(([k, v]) => (
          <div key={k} className="card-surface p-3">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className={cn("text-lg font-extrabold tabular-nums", v === "Rate missing" ? "text-destructive" : "text-foreground")}>{v}</p>
          </div>
        ))}
      </div>
      {pay.missingRate && (
        <p className="text-sm text-destructive">
          No pay rate on file for some of these days — add one in <Link to="/settings/employees" className="font-semibold underline">Settings › Employees</Link>.
        </p>
      )}

      {/* Actions — right under the totals so they're reachable on a phone
          without scrolling (and never under the floating buttons). */}
      <div className="flex gap-2">
        {locked ? (
          <Button variant="outline" className="h-12 flex-1" onClick={() => setDialog("unlock")}>
            <Lock className="mr-1.5 h-4 w-4" /> Unlock
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-12 flex-1" disabled={ts.status === "rejected" || act.isPending} onClick={() => setDialog("reject")}>
              Reject
            </Button>
            <Button className="h-12 flex-[2] font-bold" disabled={act.isPending || flags.some((f) => f.blocking) || entries.length === 0} onClick={() => act.mutate("approve")}>
              Approve & lock
            </Button>
          </>
        )}
      </div>

      {ts.status === "rejected" && ts.reject_comment && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">Sent back: {ts.reject_comment}</p>}
      {ts.employee_note && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">Note from {ts.employee?.name}: {ts.employee_note}</p>}

      {flags.length > 0 && (
        <section className="space-y-1.5">
          {flags.map((f) => (
            <div key={f.key} className={cn("rounded-lg px-3 py-2 text-sm", f.blocking ? "bg-destructive/10" : "bg-warning/10")}>
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {dayLabel(f.date)} · {f.message}
              </p>
              {ts.flag_notes?.[f.key] && <p className="mt-0.5 pl-5 text-muted-foreground">“{ts.flag_notes[f.key]}”</p>}
            </div>
          ))}
        </section>
      )}

      {/* Days */}
      <div className="space-y-2">
        {periodDays(ts.period_start, ts.period_end).map((day) => {
          const list = raw.filter((e) => e.entry_date === day);
          const t = byDay.get(day);
          if (!list.length && (locked || day > today)) return null;
          return (
            <section key={day} className="card-surface p-3">
              <header className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">{dayLabel(day)}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {t ? `${fmtHours(t.hours)} h` : "—"}
                  {t && t.ot > 0 && <span className="font-semibold text-warning-strong"> · {fmtHours(t.ot)} OT</span>}
                </p>
              </header>
              <ul className="mt-1 divide-y divide-hairline">
                {list.map((e) => (
                  <li key={e.id}>
                    <button type="button" disabled={locked} onClick={() => openEdit(e)} className={cn("flex w-full items-start gap-2 py-2 text-left", flagged.has(e.id) && "text-warning-strong")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.project?.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {e.start_at ? `${fmtClock(e.start_at)} – ${e.end_at ? fmtClock(e.end_at) : "no clock-out"}` : "Hours entered on the job"}
                          {e.break_minutes ? ` · ${e.break_minutes}m break` : ""}
                          {e.source === "timer" ? " · timer" : e.source === "owner" ? " · added by office" : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-bold tabular-nums">{fmtHours(Number(e.hours))} h</span>
                        <span className="block text-[11px] tabular-nums text-muted-foreground">
                          {Number(e.ot_hours ?? 0) > 0 ? `${fmtHours(Number(e.reg_hours))} + ${fmtHours(Number(e.ot_hours))} OT · ` : ""}
                          {e.hourly_rate != null ? `$${Number(e.hourly_rate)}/h · ${formatCurrency(Number(e.cost))}` : "no rate"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!locked && day <= today && (
                <button
                  type="button"
                  onClick={() => setEditing({ id: null, project_id: raw[0]?.project_id ?? projects[0]?.id ?? "", date: day, start: "07:00", end: "15:30", break_minutes: 30, note: "" })}
                  className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add time
                </button>
              )}
            </section>
          );
        })}
      </div>

      <section className="card-surface p-4">
        <h3 className="text-sm font-bold text-foreground">Activity</h3>
        <ul className="mt-2 space-y-1.5">
          {events.map((ev) => (
            <li key={ev.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">{new Date(ev.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> ·{" "}
              {ev.actor ?? "—"} {describeEvent(ev)}
            </li>
          ))}
          {events.length === 0 && <li className="text-xs text-muted-foreground">Nothing yet.</li>}
        </ul>
      </section>

      <TimeEntryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        projects={projectOptions}
        saving={save.isPending || del.isPending}
        onSave={(d) => save.mutate(d)}
        onDelete={editing?.id ? () => del.mutate(editing.id!) : undefined}
        title={editing?.id ? `Edit ${ts.employee?.name}'s time` : `Add time for ${ts.employee?.name}`}
      />

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md space-y-3">
          <DialogHeader>
            <DialogTitle>{dialog === "reject" ? "Send back to the employee" : "Unlock this timesheet"}</DialogTitle>
          </DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={dialog === "reject" ? "What needs fixing?" : "Why is it being unlocked? (kept in the log)"} />
          <Button className="h-11 w-full" disabled={!comment.trim() || act.isPending} onClick={() => dialog && act.mutate(dialog)}>
            {dialog === "reject" ? "Reject" : "Unlock"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { start_at: "start", end_at: "end", break_minutes: "break", hours: "hours", note: "note", entry_date: "date", project_id: "project" };
const show = (k: string, v: unknown) => (v == null || v === "" ? "—" : k.endsWith("_at") ? fmtClock(String(v)) : String(v));

function describeEvent(ev: TimesheetEvent): string {
  switch (ev.kind) {
    case "entry_added":
      return `added ${ev.after?.start_at ? `${fmtClock(String(ev.after.start_at))}–${fmtClock((ev.after.end_at as string) ?? null)}` : "time"} on ${ev.after?.entry_date}`;
    case "entry_deleted":
      return `deleted an entry on ${ev.before?.entry_date}`;
    case "entry_edited": {
      const changes = Object.keys(FIELD_LABEL)
        .filter((k) => JSON.stringify(ev.before?.[k]) !== JSON.stringify(ev.after?.[k]))
        .map((k) => `${FIELD_LABEL[k]} ${show(k, ev.before?.[k])} → ${show(k, ev.after?.[k])}`);
      return `edited ${ev.after?.entry_date ?? ""}: ${changes.join(", ") || "entry"}`;
    }
    case "submitted":
      return `submitted${ev.comment ? ` — “${ev.comment}”` : ""}`;
    case "approved":
      return "approved and locked";
    case "rejected":
      return `sent it back — “${ev.comment ?? ""}”`;
    case "unlocked":
      return `unlocked — “${ev.comment ?? ""}”`;
    case "exported":
      return "marked the pay period exported";
    case "paid":
      return `marked the pay period paid${ev.comment ? ` (${ev.comment.replace(/^Paid /, "")})` : ""}`;
    case "export_unlocked":
      return "unlocked the pay period export";
    default:
      return ev.kind;
  }
}

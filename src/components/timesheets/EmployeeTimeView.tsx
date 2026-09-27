import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { clockIn, clockOut, deleteMyTimeEntry, getMyTimesheet, saveMyTimeEntry, submitMyWeek, type MyTimeEntry } from "@/lib/api";
import {
  TIMESHEET_STATUS,
  addDaysIso,
  canSubmit,
  dayLabel,
  dayTotals,
  elapsed,
  fmtClock,
  fmtHours,
  isoDay,
  periodDays,
  periodTotals,
  timesheetFlags,
  toTimeInput,
} from "@/lib/timesheets";
import { TimeEntryDialog, type EntryDraft } from "./TimeEntryDialog";

const shortRange = (a: string, b: string) => `${dayLabel(a).split(", ").slice(1).join(", ")} – ${dayLabel(b).split(", ").slice(1).join(", ")}`;

/**
 * Crew › Time (0131): clock in / out (the start time is saved on the
 * server, so the timer keeps running if the browser closes), this pay
 * period's entries by day with daily / weekly totals and overtime, the
 * checks that gate "Submit week", and Submit. Editable until submitted.
 */
export function EmployeeTimeView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = isoDay(new Date());
  const [date, setDate] = useState(today);
  const { data: ts, isLoading } = useQuery({ queryKey: ["my-timesheet", date], queryFn: () => getMyTimesheet(date) });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ts?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ts?.running]);

  const [project, setProject] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [outNote, setOutNote] = useState("");
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [weekNote, setWeekNote] = useState("");
  useEffect(() => {
    if (ts) setNotes(ts.flag_notes ?? {});
  }, [ts]);
  useEffect(() => {
    if (!project && ts?.projects.length) setProject(ts.projects[0].id);
  }, [ts, project]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-timesheet"] });
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const inMut = useMutation({ mutationFn: () => clockIn(project, today), onSuccess: () => (refresh(), toast({ title: "Clocked in" })), onError });
  const outMut = useMutation({
    mutationFn: () => clockOut(Math.max(0, Math.floor(Number(breakMin) || 0)), outNote.trim() || null),
    onSuccess: () => {
      setBreakMin("0");
      setOutNote("");
      refresh();
      toast({ title: "Clocked out" });
    },
    onError,
  });
  const saveMut = useMutation({
    mutationFn: (d: EntryDraft & { start_at: string; end_at: string | null }) =>
      saveMyTimeEntry({ id: d.id, project_id: d.project_id, date: d.date, start_at: d.start_at, end_at: d.end_at, break_minutes: d.break_minutes, note: d.note.trim() || null }),
    onSuccess: () => (setEditing(null), refresh()),
    onError,
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteMyTimeEntry(id), onSuccess: () => (setEditing(null), refresh()), onError });
  const submitMut = useMutation({
    mutationFn: () => submitMyWeek(date, notes, weekNote.trim() || null),
    onSuccess: () => (refresh(), toast({ title: "Timesheet submitted" })),
    onError,
  });

  const entries = useMemo(() => ts?.entries ?? [], [ts]);
  const flags = useMemo(
    () => (ts ? timesheetFlags(entries, { today, longDayHours: ts.settings.long_day_hours, rainDays: ts.rain_days }) : []),
    [ts, entries, today],
  );
  if (isLoading || !ts) return <p className="p-6 text-muted-foreground">Loading…</p>;

  const editable = (ts.status === "not_submitted" || ts.status === "rejected") && !ts.locked;
  const totals = periodTotals(entries);
  const byDay = dayTotals(entries);
  const flaggedIds = new Set(flags.flatMap((f) => f.entryIds));
  const blockingIds = new Set(flags.filter((f) => f.blocking).flatMap((f) => f.entryIds));
  const submit = canSubmit(flags, notes);
  const inPeriod = today >= ts.period_start && today <= ts.period_end;
  const status = TIMESHEET_STATUS[ts.status];
  const openNew = (day: string) =>
    setEditing({ id: null, project_id: ts.projects[0]?.id ?? "", date: day, start: "07:00", end: "15:30", break_minutes: 30, note: "" });
  const openEdit = (e: MyTimeEntry) =>
    setEditing({ id: e.id, project_id: e.project_id, date: e.entry_date, start: toTimeInput(e.start_at), end: toTimeInput(e.end_at), break_minutes: e.break_minutes, note: e.note ?? "" });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24 md:p-8">
      <h1 className="text-2xl font-bold text-foreground">My time</h1>

      {/* Clock */}
      <section className={cn("rounded-2xl p-4", ts.running ? "bg-primary/90 text-primary-foreground" : "card-surface")}>
        {ts.running ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide opacity-80">Clocked in · {ts.running.project}</p>
            <p className="font-mono text-4xl font-extrabold tabular-nums">{elapsed(ts.running.start_at, now)}</p>
            <p className="text-sm opacity-80">Since {fmtClock(ts.running.start_at)}</p>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <label className="block text-xs font-semibold">
                Break (min)
                <Input inputMode="numeric" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="mt-1 h-11 bg-background text-foreground" />
              </label>
              <label className="block text-xs font-semibold">
                Note
                <Input value={outNote} onChange={(e) => setOutNote(e.target.value)} placeholder="Optional" className="mt-1 h-11 bg-background text-foreground" />
              </label>
            </div>
            <Button variant="secondary" className="h-12 w-full text-base font-bold" disabled={outMut.isPending} onClick={() => outMut.mutate()}>
              Clock out
            </Button>
          </div>
        ) : ts.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">You're not assigned to any active projects yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock className="h-4 w-4" /> Not clocked in
            </p>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Pick a project" />
              </SelectTrigger>
              <SelectContent>
                {ts.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="h-12 w-full text-base font-bold" disabled={!project || inMut.isPending} onClick={() => inMut.mutate()}>
              Clock in
            </Button>
          </div>
        )}
      </section>

      {ts.previous && (ts.previous.status === "not_submitted" || ts.previous.status === "rejected") && !(date >= ts.previous.period_start && date <= ts.previous.period_end) && (
        <button type="button" onClick={() => setDate(ts.previous!.period_start)} className="w-full rounded-lg bg-warning/10 px-3 py-2 text-left text-sm text-foreground">
          <span className="font-semibold">Last period ({shortRange(ts.previous.period_start, ts.previous.period_end)})</span>{" "}
          {ts.previous.status === "rejected" ? "was sent back — tap to fix and resubmit." : "isn't submitted yet — tap to review and submit."}
        </button>
      )}

      {/* Period */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Previous period" onClick={() => setDate(addDaysIso(ts.period_start, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">{shortRange(ts.period_start, ts.period_end)}</p>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", status.tone)}>{status.label}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Next period" disabled={inPeriod} onClick={() => setDate(addDaysIso(ts.period_end, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {ts.status === "rejected" && ts.reject_comment && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold">Sent back:</span> {ts.reject_comment}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Total", totals.total],
          ["Regular", totals.reg],
          ["Overtime", totals.ot],
        ].map(([k, v]) => (
          <div key={k as string} className="card-surface py-2">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className={cn("text-lg font-extrabold tabular-nums", k === "Overtime" && Number(v) > 0 ? "text-warning-strong" : "text-foreground")}>{fmtHours(v as number)}</p>
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="space-y-2">
        {periodDays(ts.period_start, ts.period_end).map((day) => {
          const list = entries.filter((e) => e.entry_date === day);
          const t = byDay.get(day);
          if (!list.length && (!editable || day > today)) return null;
          return (
            <section key={day} className="card-surface p-3">
              <header className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">{dayLabel(day)}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {t ? `${fmtHours(t.hours)} h` : "—"}
                  {t && t.ot > 0 ? <span className="font-semibold text-warning-strong"> · {fmtHours(t.ot)} OT</span> : null}
                </p>
              </header>
              <ul className="mt-1 divide-y divide-hairline">
                {list.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={!editable || (!!e.start_at && !e.end_at && e.entry_date === today)}
                      onClick={() => openEdit(e)}
                      className={cn("flex w-full items-center gap-2 py-2 text-left", blockingIds.has(e.id) ? "text-destructive" : flaggedIds.has(e.id) ? "text-warning-strong" : "")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.project}</span>
                        <span className="block text-xs text-muted-foreground">
                          {e.start_at ? `${fmtClock(e.start_at)} – ${e.end_at ? fmtClock(e.end_at) : "…"}` : "Hours"}
                          {e.break_minutes ? ` · ${e.break_minutes}m break` : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums">{fmtHours(e.hours)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {editable && day <= today && (
                <button type="button" onClick={() => openNew(day)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
                  <Plus className="h-3.5 w-3.5" /> Add time
                </button>
              )}
            </section>
          );
        })}
        {entries.length === 0 && !editable && <p className="py-6 text-center text-sm text-muted-foreground">No time this period.</p>}
      </div>

      {/* Flags + submit */}
      {editable && entries.length > 0 && (
        <section className="card-surface space-y-3 p-4">
          {flags.length > 0 && (
            <div className="space-y-2">
              {flags.map((f) => (
                <div key={f.key} className={cn("rounded-lg px-3 py-2", f.blocking ? "bg-destructive/10" : "bg-warning/10")}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {dayLabel(f.date)} · {f.message}
                  </p>
                  {!f.blocking && (
                    <Input
                      value={notes[f.key] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [f.key]: e.target.value }))}
                      placeholder="Explain (or fix the entry)"
                      className="mt-1.5 h-10 bg-background"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <Textarea value={weekNote} onChange={(e) => setWeekNote(e.target.value)} rows={2} placeholder="Note for the office (optional)" />
          {submit.reason && <p className="text-xs text-muted-foreground">{submit.reason}</p>}
          <Button className="h-12 w-full text-base font-bold" disabled={!submit.ok || submitMut.isPending || !!ts.running} onClick={() => submitMut.mutate()}>
            Submit {shortRange(ts.period_start, ts.period_end)}
          </Button>
        </section>
      )}

      <TimeEntryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
        projects={[...ts.projects, ...entries.filter((e) => !ts.projects.some((p) => p.id === e.project_id)).map((e) => ({ id: e.project_id, name: e.project }))].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i)}
        saving={saveMut.isPending || delMut.isPending}
        onSave={(d) => saveMut.mutate(d)}
        onDelete={editing?.id ? () => delMut.mutate(editing.id!) : undefined}
      />
    </div>
  );
}

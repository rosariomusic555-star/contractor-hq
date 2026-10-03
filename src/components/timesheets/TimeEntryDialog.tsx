import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dayLabel, entryProblem, fmtHours, previewHours, toIso } from "@/lib/timesheets";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

export interface EntryDraft {
  id: string | null;
  project_id: string;
  date: string;
  start: string; // HH:mm
  end: string; // HH:mm or ""
  break_minutes: number;
  note: string;
}

/**
 * Add / edit one time entry — project, start, end, break, note — with a
 * live hours preview (the saved number comes from the server: rounding and
 * auto lunch apply there). Shared by the crew's Time screen and the owner's
 * timesheet review.
 */
function TimeEntryDialogInner({
  open,
  onOpenChange,
  initial,
  projects,
  onSave,
  onDelete,
  saving,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: EntryDraft | null;
  projects: { id: string; name: string }[];
  onSave: (d: EntryDraft & { start_at: string; end_at: string | null }) => void;
  onDelete?: () => void;
  saving: boolean;
  title?: string;
}) {
  const [d, setD] = useState<EntryDraft | null>(initial);
  useEffect(() => {
    if (open) setD(initial);
  }, [open, initial]);
  if (!d) return null;
  const startIso = d.start ? toIso(d.date, d.start) : null;
  const endIso = d.end && startIso ? toIso(d.date, d.end, startIso) : null;
  const hours = previewHours(startIso, endIso, d.break_minutes);
  const problem = entryProblem(startIso, endIso, d.break_minutes);
  const valid = !!d.project_id && !!d.start && (!d.end || (hours != null && hours > 0 && !problem.error));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? (d.id ? "Edit time" : "Add time")} · {dayLabel(d.date)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Project</span>
            <Select value={d.project_id} onValueChange={(v) => setD({ ...d, project_id: v })}>
              <SelectTrigger className="mt-1 h-11">
                <SelectValue placeholder="Pick a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Start</span>
              <Input type="time" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} className="mt-1 h-11" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">End</span>
              <Input type="time" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} className="mt-1 h-11" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Unpaid break (minutes)</span>
            <Input
              inputMode="numeric"
              value={String(d.break_minutes)}
              onChange={(e) => setD({ ...d, break_minutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className="mt-1 h-11 w-28"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Note (optional)</span>
            <Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="What you worked on" className="mt-1 h-11" />
          </label>
          <p className="text-sm text-muted-foreground">
            {problem.error ? (
              <span className="text-destructive">{problem.error}</span>
            ) : hours != null ? (
              <>
                <span className="font-bold text-foreground">{fmtHours(hours)} hours</span> before any rounding
                {problem.overnight && <span className="font-semibold text-warning-strong"> · ends the next day</span>}
              </>
            ) : d.end ? (
              <span className="text-destructive">End time must be after the start.</span>
            ) : (
              "No end time yet — add it when you know it."
            )}
          </p>
          <div className="flex gap-2">
            {onDelete && d.id && (
              <Button variant="outline" className="h-11 text-destructive" disabled={saving} onClick={onDelete}>
                Delete
              </Button>
            )}
            <Button className="h-11 flex-1" disabled={!valid || saving} onClick={() => startIso && onSave({ ...d, start_at: startIso, end_at: endIso })}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const TimeEntryDialog = withErrorBoundary(TimeEntryDialogInner, "TimeEntryDialog");

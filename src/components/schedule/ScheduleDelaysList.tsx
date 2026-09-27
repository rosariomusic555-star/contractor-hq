import { CloudRain, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScheduleDelay } from "@/lib/api";
import { DELAY_REASON_LABEL, WEATHER_REASONS, changeSummary, delayDayLabel } from "@/lib/scheduleShift";
import { useProjectDelays, useUndoScheduleDelay } from "./useUndoScheduleDelay";

/**
 * A job's delay history (0120): each delay on this job — or another job's
 * delay that cascaded into it — with what moved. `canUndo` (owner) adds
 * Undo, which the server only allows when nothing else has changed those
 * dates since. The crew view shows the same list read-only (the "Rain
 * delay" marker on the original day).
 */
export function ScheduleDelaysList({ projectId, canUndo, className }: { projectId: string; canUndo: boolean; className?: string }) {
  const { data: delays = [] } = useProjectDelays(projectId);
  const undo = useUndoScheduleDelay();
  if (delays.length === 0) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {delays.map((d) => (
        <DelayRow key={d.id} d={d} projectId={projectId} canUndo={canUndo} onUndo={() => undo.undo(d.id)} pending={undo.isPending} />
      ))}
    </ul>
  );
}

function DelayRow({ d, projectId, canUndo, onUndo, pending }: { d: ScheduleDelay; projectId: string; canUndo: boolean; onUndo: () => void; pending: boolean }) {
  const own = d.project_id === projectId;
  const mine = d.changes.find((c) => c.project_id === projectId);
  const primary = d.changes.find((c) => c.role === "primary");
  const weather = WEATHER_REASONS.has(d.reason);
  const title = own
    ? `${weather ? "Rain delay" : "Delay"} · ${delayDayLabel(d.delay_date)} · +${d.days} working day${d.days === 1 ? "" : "s"}`
    : `Shifted +${mine?.shift_days ?? "?"} day${mine?.shift_days === 1 ? "" : "s"} — ${d.crew_name ?? "crew"} delay on ${primary?.name ?? "another job"}`;
  const cascadedCount = d.changes.filter((c) => c.role === "cascade").length;
  return (
    <li className={cn("rounded-xl border border-border px-3 py-2 text-xs", d.undone_at && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className={cn("flex items-center gap-1 font-semibold", d.undone_at ? "text-muted-foreground line-through" : "text-foreground")}>
            <CloudRain className={cn("h-3.5 w-3.5 shrink-0", weather ? "text-info" : "text-muted-foreground")} />
            <span className="[overflow-wrap:anywhere]">{title}</span>
          </span>
          <span className="block text-muted-foreground">
            {DELAY_REASON_LABEL[d.reason]}
            {own && ` · ${d.mode === "extend" ? "end extended" : "pushed"}`}
            {own && cascadedCount > 0 && ` · ${cascadedCount} ${d.crew_name ?? "crew"} job${cascadedCount === 1 ? "" : "s"} shifted`}
            {mine && ` · ${changeSummary(mine)}`}
          </span>
          {d.note && <span className="block text-muted-foreground [overflow-wrap:anywhere]">“{d.note}”</span>}
          <span className="block text-muted-subtle">
            {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {canUndo && d.created_by_name ? ` · ${d.created_by_name}` : ""}
            {d.undone_at ? " · undone" : ""}
          </span>
        </span>
        {canUndo && !d.undone_at && (
          <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={pending} onClick={onUndo}>
            <Undo2 className="mr-1 h-3 w-3" />
            Undo
          </Button>
        )}
      </div>
    </li>
  );
}

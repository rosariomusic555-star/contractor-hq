import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listScheduleUpdates, updateScheduleUpdate } from "@/lib/api";
import { useHeadsUp } from "./rainDelayContext";

/**
 * Client heads-up (0121) — on the Schedule card while a schedule change
 * hasn't been sent to the client (or dismissed): a rain delay, a manual
 * date change, or a first-time start date. "Send schedule update" opens the
 * heads-up sheet for them.
 */
export function HeadsUpReminder({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const openHeadsUp = useHeadsUp();
  const { data: pending = [] } = useQuery({
    queryKey: ["schedule-updates", "pending", projectId],
    queryFn: () => listScheduleUpdates({ projectId, pendingOnly: true }),
  });
  const dismiss = useMutation({
    mutationFn: async () => {
      for (const u of pending) await updateScheduleUpdate(u.id, { heads_up_status: "dismissed" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule-updates"] }),
  });
  if (!openHeadsUp || pending.length === 0) return null;

  const latest = pending[pending.length - 1];
  const title =
    latest.source === "delay"
      ? latest.reason === "rain" || latest.reason === "weather_other"
        ? "Rain delay heads-up not sent"
        : "Delay heads-up not sent"
      : latest.source === "confirm" || !latest.from_start
        ? "Start date not confirmed with the client"
        : "Dates changed — heads-up not sent";

  return (
    <div className="mt-3 rounded-xl border border-warning-strong/40 bg-warning-strong/10 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <MessageSquareText className="h-4 w-4 shrink-0 text-warning" />
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" className="h-9 font-bold" onClick={() => openHeadsUp({ ids: pending.map((u) => u.id) })}>
          Send schedule update
        </Button>
        <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

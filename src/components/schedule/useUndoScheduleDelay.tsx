import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { listScheduleDelays, undoScheduleDelay } from "@/lib/api";

export function invalidateScheduleQueries(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [["projects"], ["project"], ["schedule-delays"], ["material-orders"], ["forecast"], ["project-events"], ["employee-assigned-project"], ["schedule-updates"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

/**
 * Undo a schedule delay (0120) — all-or-nothing on the server: only when
 * every moved job/delivery still has the delayed dates. Otherwise the
 * server refuses and says which one changed; nothing is partially undone.
 * Used by the confirm toast and the project's delay history.
 */
export function useUndoScheduleDelay() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: undoScheduleDelay,
    onSuccess: () => {
      invalidateScheduleQueries(qc);
      toast({ title: "Delay undone", description: "All shifted dates were restored." });
    },
    onError: (err: Error) => toast({ title: "Couldn't undo", description: err.message, variant: "destructive" }),
  });
  return {
    undo: (id: string) => mutation.mutate(id),
    isPending: mutation.isPending,
    toastAction: (id: string) => (
      <ToastAction altText="Undo delay" onClick={() => mutation.mutate(id)}>
        Undo
      </ToastAction>
    ),
  };
}

/** A job's delays — its own, plus other jobs' delays that cascaded into it. */
export function useProjectDelays(projectId: string) {
  return useQuery({ queryKey: ["schedule-delays", projectId], queryFn: () => listScheduleDelays(projectId) });
}

export function invalidateHeadsUp(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["schedule-updates"] });
  qc.invalidateQueries({ queryKey: ["project-events"] });
  qc.invalidateQueries({ queryKey: ["communications"] });
  qc.invalidateQueries({ queryKey: ["activities"] });
}

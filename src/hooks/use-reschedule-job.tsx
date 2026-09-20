import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { updateProject, type Project } from "@/lib/api";

export interface ScheduleDates {
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
}

function patchProjectsCache(qc: ReturnType<typeof useQueryClient>, projectId: string, dates: ScheduleDates) {
  qc.setQueryData<Project[]>(["projects"], (old) =>
    old?.map((p) => (p.id === projectId ? { ...p, ...dates } : p)),
  );
}

/**
 * Drag/resize on the Backlog Schedule calendar (Month/Quarter day-drop,
 * Timeline drag-to-move/resize-to-a-day) all funnel through this one
 * mutation: optimistic cache update first (feels instant), persisted via
 * updateProject(), rolled back on failure, confirmed via an undo-able toast
 * rather than a modal — per spec, no confirm dialog interrupts the drag.
 */
export function useRescheduleJob() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const commit = (projectId: string, dates: ScheduleDates) =>
    updateProject(projectId, dates).then(() => qc.invalidateQueries({ queryKey: ["projects"] }));

  const reschedule = (projectId: string, projectName: string, next: ScheduleDates, previous: ScheduleDates) => {
    patchProjectsCache(qc, projectId, next);

    commit(projectId, next)
      .then(() => {
        toast({
          title: `${projectName} rescheduled`,
          action: (
            <ToastAction
              altText="Undo"
              onClick={() => {
                patchProjectsCache(qc, projectId, previous);
                void commit(projectId, previous);
              }}
            >
              Undo
            </ToastAction>
          ),
        });
      })
      .catch((err: Error) => {
        patchProjectsCache(qc, projectId, previous);
        toast({ title: "Couldn't reschedule", description: err.message, variant: "destructive" });
      });
  };

  return { reschedule };
}

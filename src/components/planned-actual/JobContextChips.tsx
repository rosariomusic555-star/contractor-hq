import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { updateProject, type Project } from "@/lib/api";
import { CONTEXT_FIELDS } from "@/lib/jobContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Structured job context (0114) — quick tap-to-select chips, all optional;
 * tap a selected chip again to clear it. Saved on the project (which owns
 * job data), shown on both the project page and the opportunity. Internal:
 * never reaches the Client Hub.
 */
export function JobContextChips({
  project,
  crewSize,
  className,
}: {
  project: Pick<Project, "id" | "job_slope" | "job_access" | "job_soil" | "job_demo">;
  /** From labor entries, when there are any. */
  crewSize?: number | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: (patch: Partial<Pick<Project, "job_slope" | "job_access" | "job_soil" | "job_demo">>) => updateProject(project.id, patch),
    onMutate: async (patch) => {
      // Optimistic, so a tap feels instant on a phone.
      for (const key of [["projects", project.id], ["project", project.id]])
        qc.setQueryData(key, (old: Project | undefined) => (old ? { ...old, ...patch } : old));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", project.id] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  return (
    <div className={cn("space-y-2.5", className)}>
      {CONTEXT_FIELDS.map((f) => {
        const value = project[f.column] as string | null | undefined;
        return (
          <div key={f.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">{f.label}</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
              {f.options.map((o) => {
                const on = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    title={"hint" in o ? (o as { hint?: string }).hint : undefined}
                    onClick={() => save.mutate({ [f.column]: on ? null : o.value } as never)}
                    className={cn(
                      "min-h-[32px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {crewSize != null && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">Crew size</div>
          <div className="text-xs text-foreground">
            <span className="font-semibold">{crewSize}</span> <span className="text-muted-foreground">avg per day, from labor entries</span>
          </div>
        </div>
      )}
    </div>
  );
}

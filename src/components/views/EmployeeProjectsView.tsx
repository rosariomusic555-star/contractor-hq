import { useQuery } from "@tanstack/react-query";
import { ListCard } from "@/components/common/ListCard";
import { StatusPill } from "@/components/common/StatusPill";
import { listMyAssignedProjects } from "@/lib/api";
import { projectStatusMeta } from "@/lib/statusMeta";

/** The employee's entire home screen — nothing else in the app's
 * navigation is reachable from here. `listMyAssignedProjects()` is
 * deliberately minimal (id/name/status only, no client embed) and RLS
 * (migration 0043) is what actually restricts the rows to this
 * employee's assignments — this is just the list. */
export function EmployeeProjectsView() {
  const {
    data: projects = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["employee-assigned-projects"],
    queryFn: listMyAssignedProjects,
  });

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">My projects</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Projects you've been assigned to.</p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Couldn't load your projects.</p>}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="card-surface p-10 text-center text-muted-foreground">
          You haven't been assigned to any projects yet — check back once your employer adds you to one.
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <ListCard key={p.id} to={`/employee/projects/${p.id}`} title={p.name}>
            <div className="mt-2">
              <StatusPill meta={projectStatusMeta(p.status)} />
            </div>
          </ListCard>
        ))}
      </div>
    </div>
  );
}

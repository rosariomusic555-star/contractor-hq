import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn, pluralize } from "@/lib/utils";
import { listProjects, type ProjectStatus } from "@/lib/api";
import { projectStatusMeta } from "@/lib/statusMeta";

/** Statuses that count as an active job — signed off and either in progress
 * or being billed. Excludes draft/quote_sent (no confirmed job yet) and paid
 * (closed out). */
const ONGOING_STATUSES: ProjectStatus[] = ["approved", "invoiced"];

/**
 * "Ongoing jobs" — real projects currently in progress. Same card shell/
 * position as the old "Today · N jobs" demo schedule; content is now live
 * Supabase data instead of a fixed demo list.
 */
export function OngoingJobsCard({ className }: { className?: string }) {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const ongoing = projects.filter((p) => ONGOING_STATUSES.includes(p.status));

  return (
    <section className={cn("card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Ongoing jobs <span className="text-muted-foreground">· {pluralize(ongoing.length, "job")}</span>
        </h3>
        <Link to="/projects" className="text-[13px] font-semibold text-primary hover:text-primary/80">
          View all
        </Link>
      </header>

      {ongoing.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No ongoing jobs right now.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {ongoing.map((project) => {
            const meta = projectStatusMeta(project.status);
            return (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="flex items-center gap-3 py-3 first:pt-1 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.client?.name ?? "No client"}
                    </p>
                  </div>
                  <span className={cn("shrink-0", meta.badge)}>{meta.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

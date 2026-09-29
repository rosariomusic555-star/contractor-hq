import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackLink } from "@/components/common/BackLink";
import { JobCostsView } from "@/components/job-costs/JobCostsView";
import { getProject } from "@/lib/api";

/** The project's Expenses page — the job-cost view (JobCostsView): actual vs
 * planned, labor, materials and every cost, with add / edit / delete. */
export function ProjectExpensesView() {
  const { id = "" } = useParams();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id), enabled: !!id });
  return (
    <div className="animate-fade-in space-y-5">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
        Back to project
      </BackLink>
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Job costs</h1>
        <p className="mt-1 truncate text-muted-foreground">{project?.name ?? " "}</p>
      </div>
      <JobCostsView projectId={id} />
    </div>
  );
}

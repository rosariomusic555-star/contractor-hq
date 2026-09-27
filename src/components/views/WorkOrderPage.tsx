import { useParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { BackLink } from "@/components/common/BackLink";
import { WorkOrderView } from "@/components/workorder/WorkOrderView";

/** Crew: /employee/projects/:id/work-order. */
export function EmployeeWorkOrderPage() {
  const { id = "" } = useParams();
  return (
    <div className="animate-fade-in space-y-3">
      <BackLink to={`/employee/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
        Job
      </BackLink>
      <WorkOrderView projectId={id} />
    </div>
  );
}

/** Contractor preview: /projects/:id/work-order — exactly what the crew sees. */
export function WorkOrderPreviewPage() {
  const { id = "" } = useParams();
  return (
    <div className="animate-fade-in space-y-3">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
        Back to project
      </BackLink>
      <p className="mx-auto flex max-w-2xl items-center gap-2 rounded-xl bg-muted p-3 text-sm text-foreground">
        <Eye className="h-4 w-4 shrink-0" /> Preview — this is exactly what your crew sees. No prices are ever included.
      </p>
      <WorkOrderView projectId={id} />
    </div>
  );
}

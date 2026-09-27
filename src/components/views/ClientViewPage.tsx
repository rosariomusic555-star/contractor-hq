import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { BackLink } from "@/components/common/BackLink";
import { ProjectMoneyBlocks } from "@/components/client-hub/ProjectMoneyBlocks";
import { ProjectHistoryTimeline } from "@/components/client-hub/ProjectHistoryTimeline";
import { ScheduleUpdatesCard } from "@/components/client-hub/ScheduleUpdatesCard";
import { CareSection } from "@/components/client-hub/CareSection";
import { ProgressSection } from "@/components/client-hub/ProgressSection";
import { ReviewCard } from "@/components/client-hub/ReviewCard";
import { ApprovedSelectionsCard } from "@/components/client-hub/ApprovedSelectionsCard";
import { DownloadSummaryButton } from "@/components/client-hub/DownloadSummaryButton";
import { getClientViewProject, getSignedImageUrls } from "@/lib/api";

/**
 * The contractor's "Client view" (0113) — the Client Hub's money and
 * project history exactly as the client sees them: the same client-safe
 * payload (get_client_view_project shares its builder with the Hub's
 * get_portal_project), the same components. Read-only.
 */
export function ClientViewPage() {
  const { id = "" } = useParams();
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["client-view", id],
    queryFn: () => getClientViewProject(id),
  });
  const logoPath = detail?.business.logo_url ?? null;
  const { data: logoUrls = {} } = useQuery({
    queryKey: ["client-view-logo", logoPath],
    queryFn: () => getSignedImageUrls([logoPath!]),
    enabled: !!logoPath,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
      </div>
    );
  }
  if (!detail) return <p className="text-destructive">Couldn't load the client view{error ? `: ${(error as Error).message}` : "."}</p>;

  const docBase = `/projects/${id}/client-view/documents`;
  const logo = logoPath ? logoUrls[logoPath] : null;

  return (
    <div className="animate-fade-in mx-auto max-w-[760px] space-y-5">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
        Back to project
      </BackLink>
      <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-foreground">
          <span className="font-semibold">Client view.</span>{" "}
          <span className="text-muted-foreground">
            This is exactly what your client sees in their Client Hub — their project money, history and documents. Their Hub
            also shows photos, deliveries, messages and anything waiting for their approval.
          </span>
        </p>
      </div>

      <div className="card-surface p-5">
        <div className="flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-muted-subtle">
              {detail.business.company_name ?? "Your company"}
            </p>
            <h1 className="truncate text-xl font-bold text-foreground">{detail.project.name}</h1>
          </div>
        </div>
      </div>

      <ScheduleUpdatesCard detail={detail} />
      <ProgressSection detail={detail} projectId={id} signUrls={getSignedImageUrls} interactive={false} />
      <CareSection detail={detail} projectId={id} interactive={false} />
      <ReviewCard detail={detail} />
      <ProjectMoneyBlocks detail={detail} docBase={docBase} />
      <ApprovedSelectionsCard detail={detail} docBase={docBase} />
      <ProjectHistoryTimeline detail={detail} docBase={docBase} />
      <DownloadSummaryButton
        detail={detail}
        getLogoUrl={async (path) => (await getSignedImageUrls([path]))[path] ?? null}
        className="w-full"
      />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { getReviewSettings, listReviewRequests } from "@/lib/api";
import type { ReviewNeedsYouInput, ReviewSettingsLike } from "@/lib/reviews";

/** Review requests shaped for buildNeedsYouItems() (0122). Only completed
 * jobs appear (a job reopened from Complete drops out). */
export function useReviewNeedsYou(): { requests: ReviewNeedsYouInput[]; settings: ReviewSettingsLike | null } {
  const { data: rows = [] } = useQuery({ queryKey: ["review-requests"], queryFn: listReviewRequests });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: getReviewSettings });
  return {
    settings: settings ?? null,
    requests: rows
      .filter((r) => r.project?.status === "complete")
      .map((r) => ({
        ...r,
        project_id: r.project_id,
        projectName: r.project?.name ?? "Project",
        clientName: r.client?.name ?? null,
        clientOptedOut: !!r.client?.no_review_requests,
      })),
  };
}

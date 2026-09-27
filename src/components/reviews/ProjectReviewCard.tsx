import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getReviewRequest, getReviewSettings, updateReviewRequest } from "@/lib/api";
import { REVIEW_STAGE_LABEL, reviewStage } from "@/lib/reviews";
import { ReviewRequestSheet } from "./ReviewRequestSheet";
import { invalidateReviews } from "./reviewQueries";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const CHANNEL: Record<string, string> = { text: "text", email: "email", copy: "copied message" };

/**
 * Project page (0122): the job's review request — where it stands (not
 * asked → asked → clicked → review left, or dismissed), and the next step:
 * Ask / Remind (one reminder) / Request review (any completed job), plus
 * "Review left" (we can't see Google posts) and Dismiss. `?review=ask|remind`
 * (from Needs you) opens the request sheet straight away.
 */
export function ProjectReviewCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data: rr } = useQuery({ queryKey: ["review-request", projectId], queryFn: () => getReviewRequest(projectId) });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: getReviewSettings });
  const [sheet, setSheet] = useState<null | { reminder: boolean }>(null);

  useEffect(() => {
    const p = params.get("review");
    if (!p || !rr) return;
    setSheet({ reminder: p === "remind" });
    params.delete("review");
    setParams(params, { replace: true });
  }, [params, setParams, rr]);

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateReviewRequest>[1]) => updateReviewRequest(rr!.id, patch),
    onSuccess: () => invalidateReviews(qc),
    onError: (err: Error) => toast({ title: "Couldn't update", description: err.message, variant: "destructive" }),
  });

  if (!rr) return null;
  const stage = reviewStage(rr, settings, !!rr.client?.no_review_requests);
  const tone = stage === "left" ? "text-success" : stage === "clicked" ? "text-info" : stage === "ask" || stage === "remind" ? "text-warning" : "text-muted-foreground";

  const lines: string[] = [];
  if (rr.asked_at) lines.push(`Asked ${when(rr.asked_at)}${rr.asked_channel ? ` by ${CHANNEL[rr.asked_channel]}` : ""}`);
  if (rr.reminded_at) lines.push(`Reminded ${when(rr.reminded_at)}`);
  if (rr.first_clicked_at) lines.push(`Opened the link ${when(rr.first_clicked_at)}${rr.click_count > 1 ? ` (${rr.click_count}×)` : ""}`);
  if (rr.left_at) lines.push(`Marked left ${when(rr.left_at)}`);

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Star className="h-4 w-4 text-warning" /> Review
        </h3>
        <span className={cn("text-xs font-bold", tone)}>{REVIEW_STAGE_LABEL[stage]}</span>
      </div>
      {lines.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{lines.join(" · ")}</p>}
      {stage === "off" && (
        <p className="mt-1 text-xs text-muted-foreground">
          Turn on review requests and add your Google link in{" "}
          <Link to="/settings/reviews" className="font-semibold text-primary">
            Settings › Reviews
          </Link>
          .
        </p>
      )}
      {stage === "waiting" && (
        <p className="mt-1 text-xs text-muted-foreground">
          {settings?.ask_when === "paid" ? "You'll be prompted once the project is fully paid" : "You'll be prompted soon"}
          {settings?.delay_days ? ` (${settings.delay_days} day${settings.delay_days === 1 ? "" : "s"} after)` : ""} — or ask now.
        </p>
      )}

      {stage !== "off" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stage === "remind" ? (
            <Button size="sm" className="h-9 font-bold" onClick={() => setSheet({ reminder: true })}>
              Remind {rr.client?.name?.split(/\s+/)[0] ?? "client"}
            </Button>
          ) : ["ask", "waiting", "dismissed", "opted_out"].includes(stage) ? (
            <Button size="sm" className="h-9 font-bold" variant={stage === "ask" ? "default" : "outline"} onClick={() => setSheet({ reminder: false })}>
              {stage === "ask" ? `Ask ${rr.client?.name?.split(/\s+/)[0] ?? "client"} for a review` : "Request review"}
            </Button>
          ) : null}
          {stage !== "left" && rr.status !== "not_asked" && rr.status !== "dismissed" && (
            <Button size="sm" variant="outline" className="h-9" disabled={update.isPending} onClick={() => update.mutate({ status: "left", left_at: new Date().toISOString() })}>
              Review left
            </Button>
          )}
          {stage === "left" && (
            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => update.mutate({ status: rr.first_clicked_at ? "clicked" : "asked", left_at: null })}>
              Undo
            </Button>
          )}
          {["ask", "remind", "asked", "waiting"].includes(stage) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-muted-foreground"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "dismissed", dismissed_at: new Date().toISOString() })}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}

      <ReviewRequestSheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)} projectId={projectId} reminder={sheet?.reminder ?? false} />
    </section>
  );
}

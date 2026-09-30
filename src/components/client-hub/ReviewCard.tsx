import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import type { PortalProjectDetail } from "@/lib/portalApi";

/**
 * Client Hub (0122): after the project is completed, a friendly review
 * card — the same tracked link as the review request message. Shown to
 * every client whose job is done (no "happy clients only" gate); hidden only
 * when the contractor turned reviews off or marked "Don't ask".
 */
/** `stacked`: always one column (the desktop Hub's narrow side panel). */
export function ReviewCard({ detail, stacked = false }: { detail: PortalProjectDetail; stacked?: boolean }) {
  const path = detail.review?.link_path;
  if (!path) return null;
  return (
    <div className={cn("card-surface flex flex-col items-start gap-3 p-5", !stacked && "sm:flex-row sm:items-center sm:justify-between")}>
      <div className="flex items-start gap-3">
        <Star className="mt-0.5 h-6 w-6 shrink-0 fill-warning-strong text-warning-strong" />
        <div>
          <p className="text-base font-bold text-foreground">Happy with your project?</p>
          <p className="text-sm text-muted-foreground">
            A quick review helps {detail.business.company_name ?? "us"} a lot.
          </p>
        </div>
      </div>
      <a
        href={path}
        target="_blank"
        rel="noopener"
        className={cn("inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-5 text-base font-bold text-primary-foreground", !stacked && "sm:w-auto")}
      >
        Leave us a review
      </a>
    </div>
  );
}

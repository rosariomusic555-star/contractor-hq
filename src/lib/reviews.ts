/* =============================================================================
 * Google review requests (0122) — status + reporting math. Pure.
 *
 * Status per project: not asked → asked (date, channel) → clicked (via the
 * tracked /r/{token} link) → review left (marked by hand); or dismissed. One
 * reminder, offered once a request has sat "asked" for reminder_days with no
 * click. Eligibility (Complete, or Complete + fully paid, plus the delay) is
 * decided on the server (run_review_checks) and shows up as eligible_at.
 *
 * No review gating: nothing here decides WHO gets the link based on how
 * happy they are — every request and reminder carries the same link.
 * ========================================================================== */

export type ReviewStatus = "not_asked" | "asked" | "clicked" | "left" | "dismissed";

export interface ReviewRequestLike {
  status: ReviewStatus;
  eligible_at: string | null;
  asked_at: string | null;
  reminded_at: string | null;
  first_clicked_at: string | null;
  left_at: string | null;
}

export interface ReviewSettingsLike {
  enabled: boolean;
  google_url: string | null;
  other_sites: { site: string; url: string }[];
  reminder_days: number;
}

/** What the contractor should see / do now. */
export type ReviewStage =
  | "off" // feature off or no review link set
  | "opted_out" // client: "Don't ask for reviews"
  | "waiting" // job done, not eligible yet (fully-paid rule or delay)
  | "ask"
  | "asked"
  | "remind"
  | "reminded"
  | "clicked"
  | "left"
  | "dismissed";

export const REVIEW_STAGE_LABEL: Record<ReviewStage, string> = {
  off: "Review requests are off",
  opted_out: "Client asked not to be asked",
  waiting: "Not asked yet",
  ask: "Ready to ask",
  asked: "Asked",
  remind: "Asked — no click yet",
  reminded: "Reminder sent",
  clicked: "Clicked the link",
  left: "Review left",
  dismissed: "Dismissed",
};

const DAY = 86_400_000;

export function hasReviewLink(s: Pick<ReviewSettingsLike, "google_url" | "other_sites"> | null | undefined): boolean {
  return !!s && (!!s.google_url?.trim() || (s.other_sites ?? []).some((x) => x.url?.trim()));
}

export function reviewStage(rr: ReviewRequestLike, s: ReviewSettingsLike | null | undefined, clientOptedOut: boolean, now: Date = new Date()): ReviewStage {
  if (!s?.enabled || !hasReviewLink(s)) return "off";
  if (rr.status === "left") return "left";
  if (rr.status === "clicked") return "clicked";
  if (clientOptedOut) return "opted_out";
  if (rr.status === "dismissed") return "dismissed";
  if (rr.status === "asked") {
    if (rr.reminded_at) return "reminded";
    const since = rr.asked_at ? (now.getTime() - new Date(rr.asked_at).getTime()) / DAY : 0;
    return since >= s.reminder_days ? "remind" : "asked";
  }
  return rr.eligible_at ? "ask" : "waiting";
}

export interface ReviewNeedsYouInput extends ReviewRequestLike {
  project_id: string;
  projectName: string;
  clientName: string | null;
  clientOptedOut: boolean;
}

/** Needs you: "Ask Greg Gray for a review" / "Remind Greg about the review".
 * The href opens the request sheet on the project page. */
export function reviewNeedsYouItems(rows: ReviewNeedsYouInput[], s: ReviewSettingsLike | null | undefined, now: Date = new Date()) {
  const out: { key: string; tone: "green"; title: string; subtitle: string; action: string; href: string; sortValue: number }[] = [];
  for (const r of rows) {
    const stage = reviewStage(r, s, r.clientOptedOut, now);
    const name = r.clientName ?? "the client";
    if (stage === "ask") {
      out.push({
        key: `review-ask-${r.project_id}`,
        tone: "green",
        title: `Ask ${name} for a review`,
        subtitle: `${r.projectName} is finished`,
        action: "Ask",
        href: `/projects/${r.project_id}?review=ask`,
        sortValue: Math.max(1, Math.floor((now.getTime() - new Date(r.eligible_at as string).getTime()) / DAY)),
      });
    } else if (stage === "remind") {
      out.push({
        key: `review-remind-${r.project_id}`,
        tone: "green",
        title: `Remind ${name.split(/\s+/)[0]} about the review`,
        subtitle: `${r.projectName} · asked ${Math.floor((now.getTime() - new Date(r.asked_at as string).getTime()) / DAY)} days ago, no click yet`,
        action: "Remind",
        href: `/projects/${r.project_id}?review=remind`,
        sortValue: Math.max(1, Math.floor((now.getTime() - new Date(r.asked_at as string).getTime()) / DAY) - (s?.reminder_days ?? 0)),
      });
    }
  }
  return out;
}

export interface ReviewSummary {
  sent: number;
  clicked: number;
  left: number;
  /** clicked ÷ sent, 0–100; null when nothing was sent. */
  clickRate: number | null;
}

/** Requests sent in the last `days` days, and how many of those were
 * clicked / marked left. */
export function reviewSummary(rows: ReviewRequestLike[], days: number, now: Date = new Date()): ReviewSummary {
  const since = now.getTime() - days * DAY;
  const sent = rows.filter((r) => r.asked_at && new Date(r.asked_at).getTime() >= since);
  const clicked = sent.filter((r) => r.first_clicked_at).length;
  const left = sent.filter((r) => r.left_at || r.status === "left").length;
  return { sent: sent.length, clicked, left, clickRate: sent.length ? Math.round((clicked / sent.length) * 100) : null };
}

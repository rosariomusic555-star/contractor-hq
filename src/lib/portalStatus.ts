import { countWorkingDays } from "./projectDuration";
import type { PortalProjectDetail } from "./portalApi";

export type PortalProjectPhase = "planning" | "scheduled" | "in_progress" | "complete";

/** Plain-language project phase for the hub — deliberately NOT the same as
 * the internal ProjectStatus (draft/quote_sent/approved/invoiced/paid,
 * which is a sales-pipeline stage, not a "where's my job" answer). Derived
 * from the same actual_start_date/actual_end_date the Estimated Duration
 * card uses, but never shows the estimate itself — that's contractor-only. */
export function portalProjectPhase(project: PortalProjectDetail["project"]): PortalProjectPhase {
  if (project.actual_end_date) return "complete";
  if (project.actual_start_date) return "in_progress";
  if (project.scheduled_start_date) return "scheduled";
  return "planning";
}

export const PORTAL_PHASE_LABEL: Record<PortalProjectPhase, string> = {
  planning: "Getting started",
  scheduled: "Scheduled",
  in_progress: "In progress",
  complete: "Complete",
};

const todayISO = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** An estimate-free progress read — "Day N" of working days since the
 * actual start, no reference to the contractor's own duration estimate or
 * over/under status (src/lib/projectDuration.ts is contractor-only). Null
 * before work has actually started. */
export function portalProgressLabel(project: PortalProjectDetail["project"], now: Date = new Date()): string | null {
  if (!project.actual_start_date) return null;
  const end = project.actual_end_date;
  const days = countWorkingDays(project.actual_start_date, end ?? todayISO(now));
  const dayWord = `${days} working day${days === 1 ? "" : "s"}`;
  return end ? `Completed — ${dayWord} on site` : `Day ${days} — work is underway`;
}

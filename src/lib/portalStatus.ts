import { countWorkingDays } from "./projectDuration";
import type { PortalProjectDetail } from "./portalApi";

export type PortalProjectPhase = "estimating" | "scheduled" | "in_progress" | "complete";

/** Plain-language project phase for the hub — now a direct 1:1 read of the
 * internal ProjectStatus (migration 0073: estimating/scheduled/in_progress/
 * complete/lost — a job-lifecycle field, not a sales-pipeline stage
 * anymore) rather than its own separate date-derived guess. The contractor
 * and client views can never disagree now — they read the same field. Lost
 * never reaches here at all (get_portal_project excludes it, migration
 * 0076); "estimating" is the fallback for anything unexpected too. */
export function portalProjectPhase(project: PortalProjectDetail["project"]): PortalProjectPhase {
  switch (project.status) {
    case "scheduled":
    case "in_progress":
    case "complete":
      return project.status;
    default:
      return "estimating";
  }
}

export const PORTAL_PHASE_LABEL: Record<PortalProjectPhase, string> = {
  estimating: "Reviewing your quote",
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

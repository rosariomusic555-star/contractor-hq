import type { Project } from "@/lib/api";

const isBooked = (p: Project) => p.status === "scheduled" || p.status === "in_progress";

/** Booked jobs whose schedule covers `day` — the Today card's list and the
 *  Dashboard banner's "N jobs scheduled today". */
export const jobsOnDay = (projects: Project[], day: string) =>
  projects.filter((p) => isBooked(p) && p.scheduled_start_date && p.scheduled_start_date <= day && (p.scheduled_end_date ?? p.scheduled_start_date) >= day);

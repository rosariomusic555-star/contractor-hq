import type { ChangeOrder, Project, ProjectStatus, Quote } from "./api";
import { projectContractValue } from "./api";

/** A job counts as "committed" backlog once it's past the quoting stage.
 * There's no real deposit-received tracking in the schema yet (flagged as a
 * gap) — this is the stated fallback: approved/invoiced/paid all mean a
 * signed contract, regardless of billing progress. */
const COMMITTED_STATUSES: ProjectStatus[] = ["approved", "invoiced", "paid"];

export type BacklogFullness = "full" | "room" | "open";

export interface BacklogMonth {
  /** "2026-10" */
  key: string;
  /** "Oct 2026" */
  label: string;
  committedDollars: number;
  jobCount: number;
  capacityDollars: number;
  remainingDollars: number;
  fullness: BacklogFullness;
  /** "Full" | "Room for 2" | "Open" */
  fullnessLabel: string;
}

export interface SeasonalBacklog {
  months: BacklogMonth[];
  seasonTotalDollars: number;
  seasonTotalJobs: number;
}

/**
 * Groups committed jobs (see COMMITTED_STATUSES) by target_install_month
 * across the next `monthsForward` calendar months (default 6, starting this
 * month). Each project's dollar value is its real contract value
 * (projectContractValue — headline quote + approved change orders), keyed
 * off `quotesByProject`/`changeOrdersByProject` maps the caller builds from
 * listQuotes()/listChangeOrders().
 *
 * "Room for N" is derived from real numbers, not a fabricated guess: N is
 * the month's own remaining capacity divided by its own average committed
 * job value so far. A month with no committed jobs yet shows "Open"
 * instead of guessing an average.
 */
export function seasonalBacklog(
  projects: Project[],
  quotesByProject: Map<string, Quote[]>,
  changeOrdersByProject: Map<string, ChangeOrder[]>,
  capacityDollarsPerMonth: number,
  monthsForward = 6,
  from: Date = new Date(),
): SeasonalBacklog {
  const months: BacklogMonth[] = [];
  for (let i = 0; i < monthsForward; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      committedDollars: 0,
      jobCount: 0,
      capacityDollars: capacityDollarsPerMonth,
      remainingDollars: capacityDollarsPerMonth,
      fullness: "open",
      fullnessLabel: "Open",
    });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const p of projects) {
    if (!p.target_install_month || !COMMITTED_STATUSES.includes(p.status)) continue;
    const month = byKey.get(p.target_install_month.slice(0, 7));
    if (!month) continue;
    const value = projectContractValue(quotesByProject.get(p.id) ?? [], changeOrdersByProject.get(p.id) ?? []);
    month.committedDollars += value;
    month.jobCount += 1;
  }

  for (const m of months) {
    m.remainingDollars = Math.max(0, m.capacityDollars - m.committedDollars);
    if (m.committedDollars <= 0) {
      m.fullness = "open";
      m.fullnessLabel = "Open";
    } else if (m.committedDollars >= m.capacityDollars) {
      m.fullness = "full";
      m.fullnessLabel = "Full";
    } else {
      const avgJobValue = m.committedDollars / m.jobCount;
      const remainingSlots = Math.max(1, Math.round(m.remainingDollars / avgJobValue));
      m.fullness = "room";
      m.fullnessLabel = `Room for ${remainingSlots}`;
    }
  }

  return {
    months,
    seasonTotalDollars: months.reduce((s, m) => s + m.committedDollars, 0),
    seasonTotalJobs: months.reduce((s, m) => s + m.jobCount, 0),
  };
}

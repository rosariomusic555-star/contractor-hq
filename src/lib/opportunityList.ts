import type { Appointment, Opportunity, Task } from "./api";

/** One row of the Opportunities page (pure — built from already-loaded data). */
export interface OpportunityRow {
  opp: Opportunity;
  categoryIds: string[];
  /** Headline quote total of its project; null until there is one. */
  value: number | null;
  /** Latest activity, else the opportunity's own last update. */
  lastActivity: string;
  next: NextUp | null;
}

export interface NextUp {
  kind: "appointment" | "task";
  label: string;
  at: string;
  overdue: boolean;
}

/** The soonest scheduled appointment or open task for an opportunity. A
 * task without a due date only counts when nothing dated is scheduled. */
export function nextUpFor(
  oppId: string,
  appointments: Pick<Appointment, "opportunity_id" | "status" | "date_time" | "type">[],
  tasks: Pick<Task, "opportunity_id" | "completed" | "due_at" | "title">[],
  now: Date = new Date(),
): NextUp | null {
  const candidates: NextUp[] = [];
  for (const a of appointments) {
    if (a.opportunity_id !== oppId || a.status !== "scheduled") continue;
    candidates.push({ kind: "appointment", label: titleCase(a.type), at: a.date_time, overdue: Date.parse(a.date_time) < now.getTime() - 86_400_000 });
  }
  for (const t of tasks) {
    if (t.opportunity_id !== oppId || t.completed) continue;
    candidates.push({ kind: "task", label: t.title, at: t.due_at ?? "", overdue: !!t.due_at && Date.parse(t.due_at) < now.getTime() });
  }
  const dated = candidates.filter((c) => c.at).sort((a, b) => a.at.localeCompare(b.at));
  return dated[0] ?? candidates[0] ?? null;
}

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export interface OpportunityFilters {
  search: string;
  stage: string | null;
  leadSource: string | null;
  categoryId: string | null;
  /** Created on/after (YYYY-MM-DD). */
  from: string | null;
  /** Created on/before (YYYY-MM-DD). */
  to: string | null;
  includeClosed: boolean;
}

export const EMPTY_FILTERS: OpportunityFilters = {
  search: "",
  stage: null,
  leadSource: null,
  categoryId: null,
  from: null,
  to: null,
  includeClosed: false,
};

const CLOSED = new Set(["won", "lost"]);

export function filterOpportunityRows(rows: OpportunityRow[], f: OpportunityFilters): OpportunityRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(({ opp, categoryIds }) => {
    // Picking Won/Lost as the stage filter shows them even with the toggle off.
    if (!f.includeClosed && CLOSED.has(opp.stage) && f.stage !== opp.stage) return false;
    if (f.stage && opp.stage !== f.stage) return false;
    if (f.leadSource && (opp.lead_source ?? "") !== f.leadSource) return false;
    if (f.categoryId && !categoryIds.includes(f.categoryId)) return false;
    const created = opp.created_at.slice(0, 10);
    if (f.from && created < f.from) return false;
    if (f.to && created > f.to) return false;
    if (q && !`${opp.title} ${opp.client?.name ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

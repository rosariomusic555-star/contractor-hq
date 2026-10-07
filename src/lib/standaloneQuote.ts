/**
 * Standalone quotes (quotes.project_id is null) — an approved one has to
 * become a project before the job workflow works (0166,
 * CreateProjectFromQuoteDialog).
 */

/** Approved, not in a project yet — the banner, the list badge, Needs you. */
export const isApprovedStandalone = (q: { status: string; project_id: string | null }) =>
  q.status === "approved" && q.project_id == null;

/** What the contractor clicked that needs a project — the modal opens
 * first, then the app carries on to it (see useStandaloneQuoteProject). */
export type ProjectAction = "invoice" | "deposit" | "payment" | "change_order" | "schedule" | "cost_plan";

export const PROJECT_ACTION_LABEL: Record<ProjectAction, string> = {
  invoice: "Create invoice",
  deposit: "Send deposit invoice",
  payment: "Record payment",
  change_order: "Create change order",
  schedule: "Schedule",
  cost_plan: "Create cost plan",
};

/** "Greg Gray — Paver Patio": quotes have no title of their own. */
export function suggestedProjectName(clientName: string | null | undefined, sectionNames: string[]): string {
  const work = sectionNames.map((n) => n.trim()).filter(Boolean);
  const what = work.length > 2 ? `${work[0]} + ${work.length - 1} more` : work.join(" + ");
  const who = clientName?.trim() ?? "";
  return [who, what].filter(Boolean).join(" — ") || "New project";
}

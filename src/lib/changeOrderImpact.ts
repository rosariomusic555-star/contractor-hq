/* =============================================================================
 * Change Order Builder — "Project impact" panel calculation.
 *
 * The single place that computes "what does this change order do to the
 * project's numbers" — before/after contract total, billing, cost/margin,
 * and schedule. Built entirely from the same primitives the project page,
 * dashboard, and Revenue page already use (projectContractValue,
 * approvedChangeOrderTotal, materialsCogs, quoteTotal) — nothing here
 * computes a project's contract value independently; it only adds the
 * "plus this in-progress change order" layer on top.
 * ========================================================================== */

import type { ChangeOrder, Invoice, MaterialsSection, Project, Quote } from "./api";
import { costPlanHasEntries, costPlanTotal } from "./costPlanMath";
import { approvedChangeOrderTotal, pickHeadlineQuote, quoteTotal } from "./api";
import { ALL_TIME_RANGE, invoicedTotal, collectedTotal } from "./financials";

export interface ProjectImpact {
  originalContract: number;
  /** Sum of every OTHER approved change order on this project (excludes
   * the one currently being built/viewed). */
  previouslyApproved: number;
  previouslyApprovedCount: number;
  /** This change order's own total — live, from its current draft. */
  thisChangeOrder: number;
  revisedContractTotal: number;

  invoicedToDate: number;
  paidToDate: number;
  remainingToBill: number;

  /** Null when there's no materials sheet at all yet — "cost unknown,"
   * not zero, same convention as the Avg. margin Revenue page. */
  costBefore: number | null;
  /** This change order's own line items have no cost data source (quotes
   * don't collect one either — cost only ever comes from the Materials
   * Sheet) — costAfter is costBefore unchanged, with unknownCostItemCount
   * flagging how many of THIS change order's items are unaccounted for. */
  costAfter: number | null;
  unknownCostItemCount: number;
  marginPctBefore: number | null;
  marginPctAfter: number | null;

  estimatedDurationBefore: number | null;
  estimatedDurationAfter: number | null;
  /** This change order's own schedule_impact_days, parsed from the draft
   * (may differ from what's persisted while editing). */
  scheduleImpactDays: number;
}

export function computeProjectImpact(input: {
  project: Project;
  /** Every quote on the project — pickHeadlineQuote() picks "the" one. */
  quotes: Quote[];
  /** Every OTHER change order on the project (excludes the one being
   * built/viewed — its own live total comes from `draftSections` instead). */
  otherChangeOrders: ChangeOrder[];
  invoices: Invoice[];
  materialsSections: MaterialsSection[];
  /** This change order's current draft total (live, unsaved-included) —
   * computed by the caller from its own draft state, same "local reduce
   * over the draft" pattern the Quote builder already uses for its own
   * live total (there's no persisted total to read mid-edit). */
  thisChangeOrderTotal: number;
  /** How many line items are currently in the draft — every one of them
   * is "cost unknown" (see costAfter's doc comment). */
  thisChangeOrderItemCount: number;
  /** This change order's current draft schedule impact (may be unsaved). */
  draftScheduleImpactDays: number | null;
}): ProjectImpact {
  const {
    project,
    quotes,
    otherChangeOrders,
    invoices,
    materialsSections,
    thisChangeOrderTotal,
    thisChangeOrderItemCount,
    draftScheduleImpactDays,
  } = input;

  const headline = pickHeadlineQuote(quotes);
  const originalContract = headline ? quoteTotal(headline.quote_sections) : 0;

  const approvedOthers = otherChangeOrders.filter((co) => co.status === "approved");
  const previouslyApproved = approvedChangeOrderTotal(approvedOthers);
  const previouslyApprovedCount = approvedOthers.length;

  const thisChangeOrder = thisChangeOrderTotal;
  const revisedContractTotal = originalContract + previouslyApproved + thisChangeOrder;

  const invoicedToDate = invoicedTotal(invoices, ALL_TIME_RANGE);
  const paidToDate = collectedTotal(invoices, ALL_TIME_RANGE);
  const remainingToBill = Math.max(0, revisedContractTotal - invoicedToDate);

  // Any planned cost at all (lines or labor) — else "unknown", not $0.
  const costBefore = costPlanHasEntries(materialsSections) ? costPlanTotal(materialsSections) : null;
  const unknownCostItemCount = thisChangeOrderItemCount;
  // This change order's own new scope is never counted into cost (no cost
  // data source for it — see costAfter's own doc comment above), so
  // costAfter is literally costBefore; the unknown count is what tells the
  // contractor the after-margin is incomplete, not that nothing changed.
  const costAfter = costBefore;

  const marginPctBefore =
    costBefore != null && originalContract + previouslyApproved > 0
      ? ((originalContract + previouslyApproved - costBefore) / (originalContract + previouslyApproved)) * 100
      : null;
  const marginPctAfter =
    costAfter != null && revisedContractTotal > 0 ? ((revisedContractTotal - costAfter) / revisedContractTotal) * 100 : null;

  const estimatedDurationBefore = project.estimated_duration_days;
  const previouslyApprovedScheduleImpact = approvedOthers.reduce((sum, co) => sum + (co.schedule_impact_days ?? 0), 0);
  const scheduleImpactDays = draftScheduleImpactDays ?? 0;
  const estimatedDurationAfter =
    estimatedDurationBefore == null
      ? null
      : Math.max(0, estimatedDurationBefore + previouslyApprovedScheduleImpact + scheduleImpactDays);

  return {
    originalContract,
    previouslyApproved,
    previouslyApprovedCount,
    thisChangeOrder,
    revisedContractTotal,
    invoicedToDate,
    paidToDate,
    remainingToBill,
    costBefore,
    costAfter,
    unknownCostItemCount,
    marginPctBefore,
    marginPctAfter,
    estimatedDurationBefore,
    estimatedDurationAfter,
    scheduleImpactDays,
  };
}

/** "Adds 2 working days" / "Saves 2 working days" / "No schedule change". */
export function scheduleImpactLabel(days: number | null | undefined): string {
  if (!days) return "No schedule change";
  const n = Math.abs(days);
  const unit = n === 1 ? "working day" : "working days";
  return days > 0 ? `Adds ${n} ${unit}` : `Saves ${n} ${unit}`;
}

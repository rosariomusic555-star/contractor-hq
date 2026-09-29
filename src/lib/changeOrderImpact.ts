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

import type { ChangeOrder, Invoice, MaterialsSection, Payment, Project, Quote } from "./api";
import { costPlanHasEntries, costPlanTotal } from "./costPlanMath";
import { approvedAddonQuoteTotal, approvedChangeOrderTotal, pickHeadlineQuote, quoteTotal } from "./api";
import { ALL_TIME_RANGE, invoicedTotal, collectedTotal } from "./financials";
import { remainingToInvoice } from "./projectMoney";

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
  /** Contract left to put on an invoice — drafts count as already billed
   * (same rule as the project's Invoices page and createProjectInvoice), so
   * a change order's drafted invoice isn't offered again. */
  remainingToBillBefore: number;
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
  /** Payments (0111) — "paid to date" is every active payment received. */
  payments: Payment[];
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
  /** Its planned-cost change (0107: Cost plan line / labor changes on its
   * features). Undefined = unknown (a change order without cost changes). */
  thisChangeOrderCostDelta?: number;
  /** True once approved — the Cost plan already includes its changes, so
   * "before" backs them out instead of "after" adding them. */
  costAlreadyApplied?: boolean;
  /** True once approved — its schedule_impact_days are already in the
   * project's estimated duration (0071 trigger), so "before" backs them out. */
  scheduleAlreadyApplied?: boolean;
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
    thisChangeOrderCostDelta,
    costAlreadyApplied,
    scheduleAlreadyApplied,
  } = input;

  // "Original contract" = the signed quote plus approved add-on quotes —
  // everything but change orders.
  const headline = pickHeadlineQuote(quotes);
  const originalContract = (headline ? quoteTotal(headline.quote_sections) : 0) + approvedAddonQuoteTotal(quotes);

  const approvedOthers = otherChangeOrders.filter((co) => co.status === "approved");
  const previouslyApproved = approvedChangeOrderTotal(approvedOthers);
  const previouslyApprovedCount = approvedOthers.length;

  const thisChangeOrder = thisChangeOrderTotal;
  const revisedContractTotal = originalContract + previouslyApproved + thisChangeOrder;

  const invoicedToDate = invoicedTotal(invoices, ALL_TIME_RANGE);
  const paidToDate = collectedTotal(input.payments ?? [], ALL_TIME_RANGE);
  const remainingToBillBefore = remainingToInvoice(originalContract + previouslyApproved, invoices);
  const remainingToBill = remainingToInvoice(revisedContractTotal, invoices);

  // Any planned cost at all (lines or labor) — else "unknown", not $0.
  const planCost = costPlanHasEntries(materialsSections) ? costPlanTotal(materialsSections) : null;
  const delta = thisChangeOrderCostDelta ?? 0;
  const costBefore = planCost == null ? null : costAlreadyApplied ? planCost - delta : planCost;
  const costAfter = costBefore == null ? null : costBefore + delta;
  // Without planned-cost changes, its own lines have no cost source — the
  // count tells the contractor the after-margin is incomplete.
  const unknownCostItemCount = thisChangeOrderCostDelta === undefined ? thisChangeOrderItemCount : 0;

  const marginPctBefore =
    costBefore != null && originalContract + previouslyApproved > 0
      ? ((originalContract + previouslyApproved - costBefore) / (originalContract + previouslyApproved)) * 100
      : null;
  const marginPctAfter =
    costAfter != null && revisedContractTotal > 0 ? ((revisedContractTotal - costAfter) / revisedContractTotal) * 100 : null;

  // The project's estimated duration already includes every approved change
  // order's days (the 0071 approval trigger adds them) — so other approved
  // COs are never added again, and this one is backed out of "before" once
  // it's approved itself.
  const scheduleImpactDays = draftScheduleImpactDays ?? 0;
  const estimatedDurationBefore =
    project.estimated_duration_days == null
      ? null
      : Math.max(0, project.estimated_duration_days - (scheduleAlreadyApplied ? scheduleImpactDays : 0));
  const estimatedDurationAfter = estimatedDurationBefore == null ? null : Math.max(0, estimatedDurationBefore + scheduleImpactDays);

  return {
    originalContract,
    previouslyApproved,
    previouslyApprovedCount,
    thisChangeOrder,
    revisedContractTotal,
    invoicedToDate,
    paidToDate,
    remainingToBillBefore,
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

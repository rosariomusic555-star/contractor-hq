import { useQuery } from "@tanstack/react-query";
import {
  getNotificationSettings,
  listAppointments,
  listChangeOrders,
  listCloseouts,
  listInvoices,
  listMaterialOrders,
  listOpenSelectionChangeRequests,
  listOpportunities,
  listPayments,
  listProjects,
  listProgressUpdates,
  listQuotes,
  listRecommendationStates,
  listScheduleUpdates,
  listSubmittedTimesheets,
  listTasks,
} from "@/lib/api";
import { buildNeedsYouItems, type NeedsYouItem } from "@/lib/needsYou";
import { computeRecommendations, openRecommendations } from "@/lib/estimatingInsights";
import { isActivePayment, paymentUnallocated } from "@/lib/projectMoney";
import { useReviewNeedsYou } from "@/components/reviews/useReviewNeedsYou";
import { usePreconNeedsYou } from "@/components/precon/usePrecon";
import { useMaintenanceNeedsYou } from "@/components/maintenance/useMaintenance";
import { materialIssueNeedsYouItems } from "@/lib/materialsCenter";
import { isoDate } from "@/lib/weatherRisk";

/**
 * The one "Needs you" queue — every feature's action items, in one sorted
 * list. Used by the old Dashboard card, the new Dashboard card and the full
 * /needs-you page, so they can never disagree. Same query keys as the rest
 * of the app, so nothing is fetched twice.
 */
export function useNeedsYouItems(): { items: NeedsYouItem[]; isLoading: boolean } {
  const { data: quotes = [], isLoading } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: coldSettings = null } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });
  const { data: changeRequests = [] } = useQuery({ queryKey: ["selection-change-requests", "open"], queryFn: listOpenSelectionChangeRequests, staleTime: 60_000 });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => listPayments() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const { data: progressPending = [] } = useQuery({ queryKey: ["progress-updates", "pending"], queryFn: () => listProgressUpdates(undefined, "pending") });
  const { data: timesheetsSubmitted = [] } = useQuery({ queryKey: ["timesheets", "submitted"], queryFn: listSubmittedTimesheets, staleTime: 60_000 });
  const { data: headsUps = [] } = useQuery({ queryKey: ["schedule-updates", "pending", "all"], queryFn: () => listScheduleUpdates({ pendingOnly: true }), staleTime: 60_000 });
  const { data: closeouts = [] } = useQuery({ queryKey: ["all-closeouts"], queryFn: listCloseouts, staleTime: 5 * 60_000 });
  const { data: recStates = [] } = useQuery({ queryKey: ["recommendation-states"], queryFn: listRecommendationStates, staleTime: 5 * 60_000 });
  const reviews = useReviewNeedsYou();
  const precon = usePreconNeedsYou();
  const maintenance = useMaintenanceNeedsYou();
  // Open delivery issues (0152) — short / damaged / wrong item / backordered.
  const { data: materialOrders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const materialIssues = materialIssueNeedsYouItems(materialOrders, new Map(projects.map((p) => [p.id, p])), isoDate(new Date()));

  const items = buildNeedsYouItems(quotes, invoices, undefined, { opportunities, appointments }, reviews, [...precon, ...maintenance, ...materialIssues], {
    coldSettings,
    changeRequests,
    // No sent date on change orders — created_at is the closest proxy.
    changeOrders: changeOrders.map((c) => ({ id: c.id, project_id: c.project_id, status: c.status, title: c.title, updated_at: c.created_at, project: projects.find((p) => p.id === c.project_id) ?? null })),
    credits: payments.filter(isActivePayment).map((p) => ({ id: p.id, unallocated: paymentUnallocated(p), paid_on: p.paid_on, project_id: p.project_id, project: p.project ?? null })),
    tasks,
    progressPending,
    timesheetsSubmitted,
    headsUps,
    insightsOpen: openRecommendations(computeRecommendations(closeouts), recStates).length,
  });
  return { items, isLoading };
}

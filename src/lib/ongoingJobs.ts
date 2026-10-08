import type { ChangeOrder, Invoice, MaterialsItem, Payment, MaterialsUsageLog, Project, ProjectStatus, Quote } from "./api";
import { pickHeadlineQuote, projectContractValue, isDepositOverdue } from "./api";
import { quoteScopeSummary } from "./jobSize";
import { projectDurationStatus } from "./projectDuration";
import { invoiceDaysLate, isProjectClosed, ALL_TIME_RANGE, collectedTotal } from "./financials";
import type { UpcomingDelivery } from "./materialOrders";
import type { UpcomingAppointmentRow } from "./upcomingAppointments";
import { APPOINTMENT_TYPE_LABEL } from "./api";
import { materialAlerts, type DeliveryLineWithOrderStatus } from "./materialTracking";

const parseLocal = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

export interface OngoingJobAlert {
  key: "overdue_invoice" | "over_duration" | "co_awaiting" | "rain" | "deposit_not_received" | "material_alert";
  label: string;
}

export interface OngoingJobCard {
  project: Project;
  scopeLabel: string | null;
  contractTotal: number;
  paidTotal: number;
  remaining: number;
  /** 0-100, clamped — paidTotal / contractTotal. */
  paidPct: number;
  /** "Nov 10 – Nov 14" (or a single date) from scheduled_start/end_date —
   * null when neither is set. */
  scheduleWindowLabel: string | null;
  /** "Day 4 of 6" / "Day 9 of 6 · 3 over" — only set while
   * projectDurationStatus() reads "in_progress" (see its own doc comment on
   * why elapsed/estimate is measured off the *actual* start date). */
  durationLabel: string | null;
  durationOver: boolean;
  /** The single soonest upcoming thing for this job (delivery, appointment,
   * or — only when neither has a date — a change order awaiting the
   * client's signature). Null when there's nothing upcoming. */
  upNext: string | null;
  alerts: OngoingJobAlert[];
}

/** Statuses that count as an active job (migration 0073) — signed off and
 * either scheduled or in progress. Excludes estimating (no confirmed job
 * yet) and lost. Complete is excluded too — that job is done, not ongoing
 * — with isProjectClosed() in buildOngoingJobCards() below as a belt-and-
 * suspenders check for the rare case billing completed before the status
 * itself caught up. */
export const ONGOING_PROJECT_STATUSES: ProjectStatus[] = ["scheduled", "in_progress"];

const dateRangeLabel = (startISO: string | null, endISO: string | null): string | null => {
  if (!startISO) return null;
  const fmt = (iso: string) => parseLocal(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!endISO || endISO === startISO) return fmt(startISO);
  return `${fmt(startISO)} – ${fmt(endISO)}`;
};

function buildAlerts(input: {
  invoices: Invoice[];
  changeOrders: ChangeOrder[];
  durationOver: boolean;
  hasRain: boolean;
  depositOverdue: boolean;
  materialAlertCount: number;
}): OngoingJobAlert[] {
  const alerts: OngoingJobAlert[] = [];

  const overdueInvoice = input.invoices.some(
    (i) => i.status === "overdue" || (i.status === "sent" && invoiceDaysLate(i) > 0),
  );
  if (overdueInvoice) alerts.push({ key: "overdue_invoice", label: "Invoice overdue" });

  if (input.durationOver) alerts.push({ key: "over_duration", label: "Over estimate" });

  const coAwaiting = input.changeOrders.some((co) => co.status === "sent");
  if (coAwaiting) alerts.push({ key: "co_awaiting", label: "Change order awaiting client" });

  if (input.hasRain) alerts.push({ key: "rain", label: "Rain forecast on a work day" });

  if (input.depositOverdue) alerts.push({ key: "deposit_not_received", label: "Deposit not received" });

  // One coalesced chip regardless of how many material lines are flagged
  // (burn-rate/over-order/not-ordered) — keeps the card compact; the full
  // breakdown lives on the project page itself.
  if (input.materialAlertCount > 0) {
    alerts.push({
      key: "material_alert",
      // Ordering only (not ordered / over-ordered / delivery overdue) — using
      // more than planned never reaches the dashboard (0167).
      label: input.materialAlertCount === 1 ? "1 material not purchased" : `${input.materialAlertCount} materials not purchased`,
    });
  }

  return alerts;
}

/** The single soonest upcoming thing for a job. Delivery and appointment
 * both carry a real date, so whichever is sooner wins; a change order
 * awaiting signature has no date of its own (it's a pending state, not a
 * calendar event) so it's only surfaced as a fallback when there's nothing
 * dated to show instead. */
function buildUpNext(
  delivery: UpcomingDelivery | undefined,
  appointment: UpcomingAppointmentRow | undefined,
  hasPendingChangeOrder: boolean,
): string | null {
  if (delivery && (!appointment || delivery.expectedDeliveryDate <= appointment.dayKey)) {
    return `${delivery.description} arrives ${delivery.dayLabel}`;
  }
  if (appointment) {
    // "Site visit Tomorrow at 9:30 AM" (no time for a date-only appointment)
    return `${APPOINTMENT_TYPE_LABEL[appointment.appointment.type]} ${appointment.dayLabel}${appointment.timeLabel ? ` at ${appointment.timeLabel}` : ""}`;
  }
  if (hasPendingChangeOrder) return "Change order awaiting approval";
  return null;
}

function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.projectId);
    if (list) list.push(row);
    else map.set(row.projectId, [row]);
  }
  return map;
}

/**
 * Builds the redesigned Ongoing Jobs card's per-project data — money
 * (projectContractValue, the same shared contract-value function the
 * project page/dashboard/revenue all use), schedule/duration
 * (projectDuration.ts, unchanged), and the alert/"up next" logic that's new
 * to this card. Returns EVERY ongoing project, sorted by what needs
 * attention first (alerts, then in-progress jobs by soonest end date, then
 * scheduled jobs by soonest start) — the caller slices to however many
 * cards it actually renders.
 */
export function buildOngoingJobCards(input: {
  projects: Project[];
  quotesByProject: Map<string, Quote[]>;
  changeOrdersByProject: Map<string, ChangeOrder[]>;
  invoicesByProject: Map<string, Invoice[]>;
  /** Payments (0111) — "paid" is every active payment received. */
  paymentsByProject: Map<string, Payment[]>;
  deliveries: UpcomingDelivery[];
  appointmentRows: UpcomingAppointmentRow[];
  /** Dates (YYYY-MM-DD) the Weather Strip flags for work-hours rain —
   * `weatherDays.filter(d => d.flagReason === "rain").map(d => d.date)`,
   * the exact same derivation UpcomingAppointmentsCard already does, so
   * this card never fetches weather a second time. */
  rainDates: Set<string>;
  /** Material budget tracking (0080) — all optional so callers that don't
   * fetch this data yet (or predate it) keep working unchanged, just
   * without the material_alert chip. trackedLinesByProject is already
   * filtered to each project's tracked sheet(s) (see trackedSheetIds) —
   * this function doesn't have enough context (no section->sheet map) to
   * do that filtering itself. materialOrderDeliveriesByProject pairs each
   * order item with its parent order's status, same shape
   * materialTracking.ts's sheetCostSummary/materialAlerts expect. */
  trackedLinesByProject?: Map<string, MaterialsItem[]>;
  materialOrderDeliveriesByProject?: Map<string, DeliveryLineWithOrderStatus[]>;
  usageLogsByProject?: Map<string, MaterialsUsageLog[]>;
  materialAlertSettings?: { overOrderMarginPct: number; notOrderedAlertDays: number };
}): OngoingJobCard[] {
  const deliveriesByProject = groupByProject(input.deliveries);
  const appointmentsByProject = groupByProject(
    input.appointmentRows.filter((r): r is UpcomingAppointmentRow & { projectId: string } => !!r.projectId),
  );

  const cards = input.projects
    .filter((p) => ONGOING_PROJECT_STATUSES.includes(p.status))
    .map((project) => {
      const quotes = input.quotesByProject.get(project.id) ?? [];
      const changeOrders = input.changeOrdersByProject.get(project.id) ?? [];
      const invoices = input.invoicesByProject.get(project.id) ?? [];

      const contractTotal = projectContractValue(quotes, changeOrders);
      const paidTotal = collectedTotal(input.paymentsByProject.get(project.id) ?? [], ALL_TIME_RANGE);
      const remaining = Math.max(0, contractTotal - paidTotal);
      const paidPct = contractTotal > 0 ? Math.min(100, (paidTotal / contractTotal) * 100) : 0;
      const closed = isProjectClosed(contractTotal, paidTotal);

      const durationStatus = projectDurationStatus(project);
      const durationLabel =
        durationStatus.state === "in_progress"
          ? `Day ${durationStatus.elapsedDays} of ${durationStatus.estimateDays}${
              durationStatus.overDays > 0 ? ` · ${durationStatus.overDays} over` : ""
            }`
          : null;
      const durationOver =
        (durationStatus.state === "in_progress" && durationStatus.overDays > 0) ||
        (durationStatus.state === "complete" && durationStatus.diffDays > 0);

      const windowEnd = project.scheduled_end_date ?? project.scheduled_start_date;
      const hasRain =
        !!project.scheduled_start_date &&
        !!windowEnd &&
        [...input.rainDates].some((d) => d >= project.scheduled_start_date! && d <= windowEnd);

      const delivery = deliveriesByProject.get(project.id)?.[0];
      const appointment = appointmentsByProject.get(project.id)?.[0];
      const pendingChangeOrder = changeOrders.some((co) => co.status === "sent");
      const depositOverdue = isDepositOverdue(pickHeadlineQuote(quotes), paidTotal);

      let materialAlertCount = 0;
      const trackedLines = input.trackedLinesByProject?.get(project.id) ?? [];
      if (trackedLines.length > 0 && input.materialOrderDeliveriesByProject && input.usageLogsByProject && input.materialAlertSettings) {
        materialAlertCount = materialAlerts(
          project,
          trackedLines,
          input.materialOrderDeliveriesByProject.get(project.id) ?? [],
          input.usageLogsByProject.get(project.id) ?? [],
          input.materialAlertSettings,
        ).filter((a) => a.key === "not_ordered").length;
      }

      return {
        project,
        scopeLabel: quoteScopeSummary(pickHeadlineQuote(quotes)),
        contractTotal,
        paidTotal,
        remaining,
        paidPct,
        scheduleWindowLabel: dateRangeLabel(project.scheduled_start_date, project.scheduled_end_date),
        durationLabel,
        durationOver,
        upNext: buildUpNext(delivery, appointment, pendingChangeOrder),
        alerts: buildAlerts({ invoices, changeOrders, durationOver, hasRain, depositOverdue, materialAlertCount }),
        _durationState: durationStatus.state,
        _closed: closed,
      };
    })
    // A project that's been fully collected is done, regardless of what its
    // manual status dropdown still says — it shouldn't linger on this card
    // forever just because nobody remembered to flip it to a "closed" state.
    .filter((c) => !c._closed);

  return cards
    .sort((a, b) => {
      const tier = (c: (typeof cards)[number]) => (c.alerts.length > 0 ? 0 : c._durationState === "in_progress" ? 1 : 2);
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;

      if (ta === 1) {
        // In-progress jobs, soonest scheduled end date first; no end date
        // sorts last within this tier.
        return (a.project.scheduled_end_date ?? "9999-99-99").localeCompare(
          b.project.scheduled_end_date ?? "9999-99-99",
        );
      }
      if (ta === 2) {
        return (a.project.scheduled_start_date ?? "9999-99-99").localeCompare(
          b.project.scheduled_start_date ?? "9999-99-99",
        );
      }
      return 0;
    })
    .map(({ _durationState, _closed, ...card }) => card);
}

/** Smallest a job tile gets before the Ongoing jobs grid drops a column. */
export const ONGOING_TILE_MIN_PX = 150;
/** Gap between tiles (Tailwind gap-4). */
export const ONGOING_TILE_GAP_PX = 16;

/** Columns for the Ongoing jobs grid: one per job, at most 3, and never so
 * many that a tile drops under ONGOING_TILE_MIN_PX in a card `width` wide.
 * Width unknown yet (0) → by job count alone. */
export function ongoingGridColumns(jobCount: number, width: number): number {
  const byCount = Math.max(1, Math.min(jobCount, 3));
  if (!width) return byCount;
  const byWidth = Math.max(1, Math.floor((width + ONGOING_TILE_GAP_PX) / (ONGOING_TILE_MIN_PX + ONGOING_TILE_GAP_PX)));
  return Math.min(byCount, byWidth);
}

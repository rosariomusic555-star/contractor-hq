import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Briefcase } from "lucide-react";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listInvoices,
  listChangeOrders,
  listOpportunities,
  listAppointments,
  listMaterialOrders,
  listAllMaterialsSections,
  listUsageLogsForItems,
  listProjectImagesForProjects,
  getSignedImageUrls,
  getBusinessProfile,
  projectCategoryIds,
  type ChangeOrder,
  type Invoice,
  type MaterialsItem,
  type Opportunity,
  type Quote,
} from "@/lib/api";
import { getWeatherStrip, DEFAULT_WORK_WINDOW, type WorkWindow } from "@/lib/weather";
import { upcomingDeliveries } from "@/lib/materialOrders";
import { upcomingAppointmentRows } from "@/lib/upcomingAppointments";
import { buildOngoingJobCards, type OngoingJobCard } from "@/lib/ongoingJobs";
import { trackedSheetIds, type DeliveryLineWithOrderStatus } from "@/lib/materialTracking";
import { projectStatusMeta } from "@/lib/statusMeta";
import { CategoryChips } from "@/components/common/CategoryChips";

const MAX_ITEMS = 6;

function groupByProjectId<T extends { project_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const list = map.get(row.project_id);
    if (list) list.push(row);
    else map.set(row.project_id, [row]);
  }
  return map;
}

/**
 * "Ongoing jobs" — real projects currently in progress, each rendered as a
 * snapshot card (photo, scope, money, schedule, alerts) instead of a plain
 * name+badge row. All the money/schedule/alert logic lives in
 * buildOngoingJobCards() (ongoingJobs.ts) — this component is fetching +
 * rendering only.
 *
 * Weather reuses the exact query key WeatherStrip/UpcomingAppointmentsCard
 * already use for `["weather-strip", ...]`, so it's a cache hit rather than
 * a second network call once either of those has loaded on the same
 * Dashboard. The cover photo is the one genuinely new fetch this card
 * needs — batched in ONE listProjectImagesForProjects() call for exactly
 * the cards actually rendered, never one request per card.
 */
export function OngoingJobsCard({ className }: { className?: string }) {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpportunities() });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: materialOrders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const { data: materialsSections = [] } = useQuery({
    queryKey: ["materials-sections-all"],
    queryFn: listAllMaterialsSections,
  });

  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const address = profile?.address?.trim() || null;
  const workWindow: WorkWindow = profile
    ? { start: profile.crew_start_time, end: profile.crew_end_time }
    : DEFAULT_WORK_WINDOW;
  const { data: weatherDays } = useQuery({
    queryKey: ["weather-strip", address, workWindow.start, workWindow.end],
    queryFn: () => getWeatherStrip(address as string, workWindow),
    enabled: !!address,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const rainDates = new Set((weatherDays ?? []).filter((d) => d.flagReason === "rain").map((d) => d.date));

  const quotesByProject = groupByProjectId<Quote>(quotes);
  const changeOrdersByProject = groupByProjectId<ChangeOrder>(changeOrders);
  const invoicesByProject = groupByProjectId<Invoice>(invoices);
  const opportunitiesById = new Map(opportunities.map((o: Opportunity) => [o.id, o]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const deliveries = upcomingDeliveries(materialOrders, projectsById);
  const appointmentRows = upcomingAppointmentRows(appointments, opportunitiesById, projectsById);

  // Material budget tracking (0080) — tracked lines per project (only the
  // sheet(s) linked to the signed quote/an approved change order), and
  // deliveries/usage keyed the same way, so buildOngoingJobCards can flag
  // each ongoing project's material alerts without re-deriving any of this.
  const trackedLinesByProject = new Map<string, MaterialsItem[]>();
  for (const project of projects) {
    const tracked = trackedSheetIds(quotesByProject.get(project.id) ?? [], changeOrdersByProject.get(project.id) ?? []);
    if (tracked.size === 0) continue;
    // Material lines only — tracking never covers sub/equipment/other lines.
    const lines = materialsSections
      .filter((s) => tracked.has(s.sheet_id))
      .flatMap((s) => s.materials_items)
      .filter((i) => (i.cost_type ?? "material") === "material");
    if (lines.length > 0) trackedLinesByProject.set(project.id, lines);
  }
  const materialOrderDeliveriesByProject = new Map<string, DeliveryLineWithOrderStatus[]>();
  for (const order of materialOrders) {
    const list = materialOrderDeliveriesByProject.get(order.project_id) ?? [];
    for (const item of order.material_order_items) list.push({ item, orderStatus: order.status });
    materialOrderDeliveriesByProject.set(order.project_id, list);
  }
  const allTrackedLineIds = [...trackedLinesByProject.values()].flat().map((l) => l.id);
  const { data: allUsageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", allTrackedLineIds],
    queryFn: () => listUsageLogsForItems(allTrackedLineIds),
    enabled: allTrackedLineIds.length > 0,
  });
  const trackedItemToProject = new Map<string, string>();
  for (const [projectId, lines] of trackedLinesByProject) for (const l of lines) trackedItemToProject.set(l.id, projectId);
  const usageLogsByProject = new Map<string, typeof allUsageLogs>();
  for (const log of allUsageLogs) {
    const projectId = trackedItemToProject.get(log.materials_item_id);
    if (!projectId) continue;
    const list = usageLogsByProject.get(projectId) ?? [];
    list.push(log);
    usageLogsByProject.set(projectId, list);
  }

  const allCards = buildOngoingJobCards({
    projects,
    quotesByProject,
    changeOrdersByProject,
    invoicesByProject,
    deliveries,
    appointmentRows,
    rainDates,
    trackedLinesByProject,
    materialOrderDeliveriesByProject,
    usageLogsByProject,
    materialAlertSettings: profile
      ? { overOrderMarginPct: profile.material_over_order_margin_pct, notOrderedAlertDays: profile.material_not_ordered_alert_days }
      : undefined,
  });
  const shown = allCards.slice(0, MAX_ITEMS);
  const remaining = allCards.length - shown.length;
  const shownIds = shown.map((c) => c.project.id);

  const { data: images = [] } = useQuery({
    queryKey: ["project-images-cover", shownIds.join(",")],
    queryFn: () => listProjectImagesForProjects(shownIds),
    enabled: shownIds.length > 0,
  });
  const coverPathByProject = new Map<string, string>();
  for (const img of images) {
    if (!coverPathByProject.has(img.project_id)) coverPathByProject.set(img.project_id, img.storage_path);
  }
  const coverPaths = [...coverPathByProject.values()];
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["project-images-cover-urls", coverPaths.join(",")],
    queryFn: () => getSignedImageUrls(coverPaths),
    enabled: coverPaths.length > 0,
  });

  const coverUrlFor = (projectId: string): string | null => {
    const path = coverPathByProject.get(projectId);
    return path ? (signedUrls[path] ?? null) : null;
  };

  return (
    <section className={cn("card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Ongoing jobs <span className="text-muted-foreground">· {pluralize(allCards.length, "job")}</span>
        </h3>
        <Link to="/projects" className="text-[13px] font-semibold text-primary hover:text-primary/80">
          View all
        </Link>
      </header>

      {allCards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No ongoing jobs right now.</p>
      ) : (
        <>
          {/* Mobile — a horizontal swipe row (each card ~85% width so the
              next one peeks in) instead of a tall single column, so this
              card doesn't blow up the Dashboard's scroll length. */}
          <div className="scrollbar-hide -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 md:hidden">
            {shown.map((card) => (
              <div key={card.project.id} className="w-[85%] shrink-0 snap-start">
                <JobSnapshotCard card={card} coverUrl={coverUrlFor(card.project.id)} />
              </div>
            ))}
          </div>

          {/* Desktop — a real grid (2 columns, 3 once there's room). */}
          <div className="mt-4 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
            {shown.map((card) => (
              <JobSnapshotCard key={card.project.id} card={card} coverUrl={coverUrlFor(card.project.id)} />
            ))}
          </div>
        </>
      )}

      {remaining > 0 && (
        <Link to="/projects" className="mt-3 block text-[13px] font-semibold text-primary hover:text-primary/80">
          +{remaining} more
        </Link>
      )}
    </section>
  );
}

const ALERT_BADGE_CLASS: Record<OngoingJobCard["alerts"][number]["key"], string> = {
  overdue_invoice: "badge-status badge-overdue",
  over_duration: "badge-status badge-overdue",
  co_awaiting: "badge-status badge-pending",
  rain: "badge-status badge-overdue",
  deposit_not_received: "badge-status badge-overdue",
  material_alert: "badge-status badge-overdue",
};

function JobSnapshotCard({ card, coverUrl }: { card: OngoingJobCard; coverUrl: string | null }) {
  const { project } = card;
  const meta = projectStatusMeta(project.status);

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="h-24 w-full shrink-0 overflow-hidden bg-muted">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Briefcase className="h-6 w-6 text-muted-subtle" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[15px] font-bold text-foreground">{project.name}</p>
          <span className={cn("shrink-0", meta.badge)}>{meta.label}</span>
        </div>
        <p className="-mt-1.5 truncate text-xs text-muted-foreground">{project.client?.name ?? "No client"}</p>
        {card.scopeLabel && <p className="truncate text-xs text-muted-subtle">{card.scopeLabel}</p>}
        <CategoryChips categoryIds={projectCategoryIds(project)} max={2} />

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-extrabold tabular-nums text-foreground">
              {formatCurrency(card.contractTotal)}
            </span>
            <span className="shrink-0 text-[11px] text-muted-subtle">contract</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${card.paidPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatCurrency(card.paidTotal)} paid · {formatCurrency(card.remaining)} remaining
          </p>
        </div>

        {card.scheduleWindowLabel && (
          <p className="text-xs text-muted-foreground">
            {card.scheduleWindowLabel}
            {card.durationLabel && (
              <span className={cn("ml-1.5 font-semibold", card.durationOver ? "text-destructive" : "text-foreground")}>
                · {card.durationLabel}
              </span>
            )}
          </p>
        )}

        {card.upNext && (
          <p className="truncate text-xs text-foreground">
            <span className="font-semibold text-muted-foreground">Up next:</span> {card.upNext}
          </p>
        )}

        {card.alerts.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {card.alerts.map((a) => (
              <span key={a.key} className={ALERT_BADGE_CLASS[a.key]}>
                <AlertTriangle className="h-3 w-3" />
                {a.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

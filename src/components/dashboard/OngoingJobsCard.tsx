import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Briefcase } from "lucide-react";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listInvoices,
  listPayments,
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
  type Payment,
  type MaterialsItem,
  type Opportunity,
  type Quote,
} from "@/lib/api";
import { getWeatherStrip, DEFAULT_WORK_WINDOW, type WorkWindow } from "@/lib/weather";
import { upcomingDeliveries } from "@/lib/materialOrders";
import { upcomingAppointmentRows } from "@/lib/upcomingAppointments";
import { buildOngoingJobCards, ongoingGridColumns, type OngoingJobCard } from "@/lib/ongoingJobs";
import { trackedSheetIds, type DeliveryLineWithOrderStatus } from "@/lib/materialTracking";
import { projectStatusMeta } from "@/lib/statusMeta";
import { CategoryChips } from "@/components/common/CategoryChips";
import { countsTowardTotals } from "@/lib/features";
import { useCardLink } from "@/hooks/use-card-link";

const MAX_ITEMS = 6;
/** Phones stack the tiles, so fewer before "View all". */
const MOBILE_MAX_ITEMS = 3;

/** An element's content width, kept current as it resizes (0 until measured). */
function useElementWidth<T extends HTMLElement>() {
  // A callback ref, so measuring starts whenever the element mounts (the
  // grid only renders once there are jobs to show).
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

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
  const cardLink = useCardLink("/projects");
  const [gridRef, gridWidth] = useElementWidth<HTMLDivElement>();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => listPayments() });
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
  const paymentsByProject = groupByProjectId<Payment>(payments);
  const opportunitiesById = new Map(opportunities.map((o: Opportunity) => [o.id, o]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  // 0168: no per-delivery items on the dashboard.
  const deliveries: ReturnType<typeof upcomingDeliveries> = [];
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
      .filter((s) => tracked.has(s.sheet_id) && countsTowardTotals(s))
      .flatMap((s) => s.materials_items)
      .filter((i) => (i.cost_type ?? "material") === "material");
    if (lines.length > 0) trackedLinesByProject.set(project.id, lines);
  }
  const materialOrderDeliveriesByProject = new Map<string, DeliveryLineWithOrderStatus[]>();
  for (const order of materialOrders) {
    const list = materialOrderDeliveriesByProject.get(order.project_id) ?? [];
    // A requested quote hasn't bought anything yet (0168).
    if ((order.payment_status ?? "paid") !== "paid") continue;
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
    paymentsByProject,
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
  const mobileShown = shown.slice(0, MOBILE_MAX_ITEMS);
  const mobileRemaining = allCards.length - mobileShown.length;
  // Tiles share the card's full width: one column per job (max 3), fewer
  // only if the card is too narrow for them. One job gets the wide layout.
  const columns = ongoingGridColumns(shown.length, gridWidth);
  const tileLayout: TileLayout = shown.length === 1 ? (gridWidth === 0 || gridWidth >= 420 ? "wide" : "roomy") : columns <= 2 ? "roomy" : "compact";
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
    <section onClick={cardLink.onClick} className={cn(cardLink.className, "card-surface p-5", className)}>
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
          {/* Phones — full-width tiles stacked, the first few only (the
              rest behind "+N more"), so the Dashboard doesn't get too long. */}
          <div className="mt-4 space-y-3 md:hidden">
            {mobileShown.map((card) => (
              <JobSnapshotCard key={card.project.id} card={card} coverUrl={coverUrlFor(card.project.id)} layout="roomy" />
            ))}
          </div>
          {mobileRemaining > 0 && (
            <Link to="/projects" className="mt-3 block text-[13px] font-semibold text-primary hover:text-primary/80 md:hidden">
              +{mobileRemaining} more
            </Link>
          )}

          {/* Tablet / desktop — equal columns across the card's full width
              (grid rows stretch, so tiles in a row share one height). */}
          <div
            ref={gridRef}
            className="mt-4 hidden gap-4 md:grid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {shown.map((card) => (
              <JobSnapshotCard key={card.project.id} card={card} coverUrl={coverUrlFor(card.project.id)} layout={tileLayout} />
            ))}
          </div>
          {remaining > 0 && (
            <Link to="/projects" className="mt-3 hidden text-[13px] font-semibold text-primary hover:text-primary/80 md:block">
              +{remaining} more
            </Link>
          )}
        </>
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

/** wide: the only job — photo left, full details right. roomy: 1–2 per row
 * (and phones) — stacked, little truncation. compact: 3 per row. */
type TileLayout = "wide" | "roomy" | "compact";

function JobSnapshotCard({ card, coverUrl, layout = "compact" }: { card: OngoingJobCard; coverUrl: string | null; layout?: TileLayout }) {
  const { project } = card;
  const meta = projectStatusMeta(project.status);
  const wide = layout === "wide";
  const compact = layout === "compact";

  return (
    <Link
      to={`/projects/${project.id}`}
      className={cn(
        "group flex h-full overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover",
        wide ? "flex-row" : "flex-col",
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden bg-muted",
          wide ? "min-h-[220px] w-[38%] self-stretch" : compact ? "h-24 w-full" : "h-32 w-full",
        )}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Briefcase className="h-6 w-6 text-muted-subtle" />
          </div>
        )}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", wide ? "p-5" : "p-4")}>
        {/* Narrow (3-up) tiles: the badge drops under the name so the name
            gets the whole width. */}
        <div className={cn("flex gap-2", compact ? "flex-col items-start gap-1.5" : "items-start justify-between")}>
          <p
            className={cn(
              "min-w-0 font-bold text-foreground",
              wide ? "text-base [overflow-wrap:anywhere]" : "line-clamp-2 text-[15px] [overflow-wrap:anywhere]",
            )}
          >
            {project.name}
          </p>
          <span className={cn("shrink-0", meta.badge)}>{meta.label}</span>
        </div>
        <p className={cn("-mt-1.5 text-xs text-muted-foreground", compact ? "truncate" : "[overflow-wrap:anywhere]")}>
          {project.client?.name ?? "No client"}
        </p>
        {card.scopeLabel && (
          <p className={cn("text-xs text-muted-subtle", wide ? "[overflow-wrap:anywhere]" : compact ? "truncate" : "line-clamp-2")}>
            {card.scopeLabel}
          </p>
        )}
        <CategoryChips categoryIds={projectCategoryIds(project)} max={wide ? undefined : compact ? 2 : 4} />

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("font-extrabold tabular-nums text-foreground", wide ? "text-base" : "text-sm")}>
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
          <p className={cn("text-xs text-foreground", wide ? "[overflow-wrap:anywhere]" : compact ? "truncate" : "line-clamp-2")}>
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

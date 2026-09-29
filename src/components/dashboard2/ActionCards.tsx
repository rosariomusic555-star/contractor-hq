import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Eye, MessageSquare, MousePointerClick, PenLine, Snowflake, Star, Truck, Wrench, XCircle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";
import { NeedsYouChips } from "@/components/dashboard/NeedsYouChips";
import { useNeedsYouItems } from "@/components/dashboard/useNeedsYouItems";
import { useNotifications } from "@/hooks/use-notifications";
import { categoryOf, type NeedsYouCategory } from "@/lib/needsYou";
import {
  APPOINTMENT_TYPE_LABEL,
  getBusinessHealthSettings,
  getNotificationSettings,
  listAppointments,
  listCrews,
  listMaterialOrders,
  listOpportunities,
  listProjects,
  listQuotes,
  pickHeadlineQuote,
  quoteTotal,
  type Quote,
} from "@/lib/api";
import { coldLabel, coldState, timeAgoShort } from "@/lib/quoteActivity";
import { forecastWorkDays, isoDate } from "@/lib/weatherRisk";
import { useScheduleForecasts } from "@/lib/forecast";
import { upcomingDeliveries } from "@/lib/materialOrders";
import { useUpcomingPrecon } from "@/components/precon/usePrecon";
import { opportunityStageMeta } from "@/lib/statusMeta";
import { RISK_TEXT } from "@/components/weather/riskStyles";
import { Card, CardSkeleton, EmptyLine } from "./CardShell";
import { TONE_PILL } from "./tones";

const MAX = 5;
const dayName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return isoDate(x);
};

// ---------------------------------------------------------------------------
// Needs you — every feature's action items, chips, 5 + View all.
// ---------------------------------------------------------------------------
export function NeedsYouCard() {
  const { items, isLoading } = useNeedsYouItems();
  const [filter, setFilter] = useState<NeedsYouCategory | "all">("all");
  const shown = (filter === "all" ? items : items.filter((i) => categoryOf(i) === filter)).slice(0, MAX);
  return (
    <Card title="Needs you" count={items.length} viewAll={items.length > MAX ? { to: "/needs-you" } : undefined} to="/needs-you">
      {isLoading ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <EmptyLine>Nothing needs you right now.</EmptyLine>
      ) : (
        <>
          <div className="px-4 pt-2">
            <NeedsYouChips items={items} value={filter} onChange={setFilter} />
          </div>
          <ul className="divide-y divide-hairline px-4">
            {shown.map((i) => (
              <li key={i.key}>
                <NeedsYouRow item={i} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Starting soon — next 14 days: readiness, crew, day-one forecast, deliveries.
// ---------------------------------------------------------------------------
export function StartingSoonCard() {
  const today = isoDate(new Date());
  const bundles = useUpcomingPrecon(14);
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const { batch } = useScheduleForecasts();
  const starts = bundles
    .filter((b) => b.project.scheduled_start_date && b.project.scheduled_start_date > today)
    .sort((a, b) => a.project.scheduled_start_date!.localeCompare(b.project.scheduled_start_date!));
  if (starts.length === 0) return null;
  return (
    <Card title="Starting soon" count={starts.length} viewAll={{ to: "/bookings", label: "Schedule" }}>
      <ul className="divide-y divide-hairline">
        {starts.map((b) => {
          const p = b.project;
          const r = b.readiness;
          const tone = r.status === "ready" ? "green" : r.status === "blocked" ? "red" : "amber";
          const label = r.status === "ready" ? "Ready" : r.status === "blocked" ? `Blocked · ${r.openRequired.length} open` : `${r.openRequired.length} open`;
          const day1 = batch ? forecastWorkDays({ start: p.scheduled_start_date, end: p.scheduled_end_date }, batch.projects[p.id]?.forecast, batch.settings, today).find((d) => d.date === p.scheduled_start_date) : null;
          const pOrders = orders.filter((o) => o.project_id === p.id);
          const late = pOrders.some((o) => o.status !== "delivered" && o.expected_delivery_date && o.expected_delivery_date > p.scheduled_start_date!);
          const materials = pOrders.length === 0 ? null : pOrders.every((o) => o.status === "delivered") ? { t: "green" as const, l: "Materials in" } : late ? { t: "red" as const, l: "Delivery after start" } : { t: "amber" as const, l: "Materials on order" };
          const crew = crews.find((c) => c.id === (p as { crew_id?: string }).crew_id)?.name;
          return (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block px-4 py-2.5 hover:bg-muted/40">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{dayName(p.scheduled_start_date!)}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", TONE_PILL[tone])}>{label}</span>
                  {crew && <span className="text-muted-foreground">{crew}</span>}
                  {day1 && <span className={cn("font-semibold", RISK_TEXT[day1.risk.level])}>{day1.risk.level === "none" ? `${day1.weather.label} · ${day1.weather.pop}%` : day1.risk.summary}</span>}
                  {materials && <span className={cn("rounded-full px-2 py-0.5 font-semibold", TONE_PILL[materials.t])}>{materials.l}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Client activity — live engagement from existing notifications + going cold.
// ---------------------------------------------------------------------------
const ACTIVITY_KINDS: Record<string, typeof Eye> = {
  quote_first_open: Eye,
  quote_viewed_again: Eye,
  quote_selections: PenLine,
  quote_approved: Star,
  quote_declined: XCircle,
  change_order_approved: CheckCircle2,
  change_order_declined: XCircle,
  progress_comment: MessageSquare,
  review_clicked: MousePointerClick,
  maintenance_request: Wrench,
};

export function ClientActivityCard() {
  const { notifications } = useNotifications();
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: settings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });
  const cutoff = Date.now() - 14 * 86_400_000;
  const feed = notifications.filter((n) => ACTIVITY_KINDS[n.kind] && Date.parse(n.created_at) >= cutoff).slice(0, 8);
  const cold = settings
    ? quotes
        .map((q) => ({ q, c: coldState(q, settings) }))
        .filter((x): x is { q: Quote; c: NonNullable<ReturnType<typeof coldState>> } => !!x.c)
        .sort((a, b) => b.c.days - a.c.days)
        .slice(0, 3)
    : [];
  if (feed.length === 0 && cold.length === 0) return null;
  return (
    <Card title="Client activity" count={feed.length || null} viewAll={{ to: "/notifications" }}>
      <ul className="divide-y divide-hairline">
        {cold.map(({ q, c }) => (
          <li key={`cold-${q.id}`}>
            <Link to={`/quotes/${q.id}`} className="flex min-h-[44px] items-center gap-3 px-4 py-2 hover:bg-muted/40">
              <Snowflake className="h-4 w-4 shrink-0 text-info" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{q.project?.name ?? q.client?.name ?? "Quote"}</span>
                <span className="block truncate text-xs text-warning-strong">{coldLabel(c)}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatCurrency(quoteTotal(q.quote_sections))}</span>
            </Link>
          </li>
        ))}
        {feed.map((n) => {
          const Icon = ACTIVITY_KINDS[n.kind];
          return (
            <li key={n.id}>
              <Link to={n.link ?? "/notifications"} className="flex min-h-[44px] items-center gap-3 px-4 py-2 hover:bg-muted/40">
                <Icon className={cn("h-4 w-4 shrink-0", n.kind === "quote_declined" || n.kind === "change_order_declined" ? "text-destructive" : n.kind === "quote_approved" || n.kind === "change_order_approved" ? "text-success" : "text-info")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm text-foreground", !n.read_at && "font-semibold")}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgoShort(n.created_at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// This week — appointments + deliveries for the next 6 days (today is in Today).
// ---------------------------------------------------------------------------
export function ThisWeekCard() {
  const today = isoDate(new Date());
  const { data: appointments = [], isLoading } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const deliveries = upcomingDeliveries(orders, new Map(projects.map((p) => [p.id, p])), 6).filter((d) => d.date > today);
  const appts = appointments.filter((a) => a.status === "scheduled" && isoDate(new Date(a.date_time)) > today && isoDate(new Date(a.date_time)) <= addDays(today, 6));
  const days = Array.from({ length: 6 }, (_, i) => addDays(today, i + 1));
  const byDay = days
    .map((d) => ({
      d,
      appts: appts.filter((a) => isoDate(new Date(a.date_time)) === d).sort((a, b) => a.date_time.localeCompare(b.date_time)),
      deliveries: deliveries.filter((x) => x.date === d),
    }))
    .filter((x) => x.appts.length || x.deliveries.length);
  return (
    <Card title="This week" count={appts.length + deliveries.length || null} viewAll={{ to: "/appointments", label: "Appointments" }}>
      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : byDay.length === 0 ? (
        <EmptyLine>No appointments or deliveries in the next 6 days.</EmptyLine>
      ) : (
        <ul className="divide-y divide-hairline">
          {byDay.map((g) => (
            <li key={g.d} className="px-4 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{dayName(g.d)}</p>
              {g.appts.map((a) => (
                <Link key={a.id} to={a.opportunity_id ? `/pipeline/${a.opportunity_id}` : "/appointments"} className="flex min-h-[40px] items-center gap-2 text-sm hover:text-primary">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-info" />
                  <span className="min-w-0 flex-1 truncate">
                    {APPOINTMENT_TYPE_LABEL[a.type]}
                    {a.address ? <span className="text-muted-foreground"> · {a.address}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{a.all_day ? "All day" : new Date(a.date_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </Link>
              ))}
              {g.deliveries.map((x) => (
                <Link key={x.itemId} to={`/projects/${x.projectId}/material-orders`} className="flex min-h-[40px] items-center gap-2 text-sm hover:text-primary">
                  <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {x.description} <span className="text-muted-foreground">· {x.projectName}</span>
                  </span>
                  {x.conflict && <span className="shrink-0 text-[11px] font-semibold text-destructive">after start</span>}
                </Link>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline snapshot — by stage, weighted, new leads this week by source.
// ---------------------------------------------------------------------------
export function PipelineCard() {
  const { data: opps = [], isLoading } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: settings } = useQuery({ queryKey: ["business-health-settings"], queryFn: getBusinessHealthSettings, staleTime: 5 * 60_000 });
  const rows = useMemo(() => {
    const byProject = new Map<string, Quote[]>();
    for (const q of quotes) if (q.project_id) byProject.set(q.project_id, [...(byProject.get(q.project_id) ?? []), q]);
    const val = (pid: string | null) => {
      const h = pid ? pickHeadlineQuote(byProject.get(pid) ?? []) : null;
      return h ? quoteTotal(h.quote_sections) : 0;
    };
    const probs = settings?.stage_probabilities ?? {};
    return Object.keys(probs).map((stage) => {
      const list = opps.filter((o) => o.stage === stage);
      const value = list.reduce((s, o) => s + val(o.project_id), 0);
      return { stage, count: list.length, value, weighted: (value * (probs[stage] ?? 0)) / 100 };
    });
  }, [opps, quotes, settings]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const newLeads = opps.filter((o) => Date.parse(o.created_at) >= weekAgo);
  const bySource = [...new Set(newLeads.map((o) => o.lead_source?.trim() || "Unknown"))].map((s) => [s, newLeads.filter((o) => (o.lead_source?.trim() || "Unknown") === s).length] as const);
  const open = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Card title="Pipeline" count={open || null} viewAll={{ to: "/pipeline" }} single>
      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : open === 0 && newLeads.length === 0 ? (
        <EmptyLine>No open leads.</EmptyLine>
      ) : (
        <div className="px-4 py-2">
          <ul className="space-y-1">
            {rows
              .filter((r) => r.count > 0)
              .map((r) => (
                <li key={r.stage} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">
                    {opportunityStageMeta(r.stage as never).label} <span className="text-xs text-muted-foreground">· {r.count}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(r.value)}</span>
                </li>
              ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-hairline pt-2 text-sm font-semibold">
            <span>Weighted</span>
            <span className="tabular-nums text-success">{formatCurrency(rows.reduce((s, r) => s + r.weighted, 0))}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {newLeads.length} new lead{newLeads.length === 1 ? "" : "s"} this week{bySource.length ? ` · ${bySource.map(([s, n]) => `${s} ${n}`).join(", ")}` : ""}
          </p>
        </div>
      )}
    </Card>
  );
}

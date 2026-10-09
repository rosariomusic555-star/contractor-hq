import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreateOpportunityDialog } from "@/components/common/CreateOpportunityDialog";
import { RecordPaymentSheet } from "@/components/payments/RecordPaymentSheet";
import { WeatherStrip } from "@/components/dashboard/WeatherStrip";
import { WeatherRisksCard } from "@/components/dashboard/WeatherRisksCard";
import { OngoingJobsCard } from "@/components/dashboard/OngoingJobsCard";
import { BookingsCard } from "@/components/dashboard/BookingsCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { UpdatesToReviewCard } from "@/components/dashboard/UpdatesToReviewCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RecentQuotes } from "@/components/dashboard/RecentQuotes";
import { RecentInvoices } from "@/components/dashboard/RecentInvoices";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useGreeting } from "@/hooks/use-greeting";
import { cn } from "@/lib/utils";
import { createInvoice, createQuote, listInvoices } from "@/lib/api";
import { CardErrorBoundary, LazyMount } from "./CardShell";
import { CARDS, SIMPLE_EXTRAS, type CardId, type SimpleExtraId, useDashboardPrefs } from "./prefs";
import { SimpleBookingsCard, SimpleRevenueCard, SimpleWeatherRisksCard } from "./SimpleExtras";
import { TodayCard } from "./TodayCard";
import { ActivityFeedCard } from "./ActivityFeedCard";
import { DashboardBanner } from "./DashboardBanner";
import { ClientActivityCard, NeedsYouCard, PipelineCard, StartingSoonCard, ThisWeekCard } from "./ActionCards";
import { CrewTimeCard, HeadlineStrip, InsightsCard, MoneyCard, PastClientsCard } from "./SummaryCards";

/** Phone-first order: the "what do I do right now" cards, then the rest in the user's order. */
const MOBILE_FIRST: CardId[] = ["today", "needs", "starting", "activity"];

const EAGER = new Set<CardId>(["today", "needs", "starting", "activity"]);

function renderCard(id: CardId): ReactNode {
  switch (id) {
    case "today":
      return (
        <div className="space-y-2">
          <WeatherStrip />
          <TodayCard />
        </div>
      );
    case "needs":
      return <NeedsYouCard />;
    case "starting":
      return <StartingSoonCard />;
    case "activity":
      return <ClientActivityCard />;
    case "thisweek":
      return <ThisWeekCard />;
    case "weather":
      return <WeatherRisksCard />;
    case "ongoing":
      return <OngoingJobsCard />;
    case "pipeline":
      return <PipelineCard />;
    case "crew":
      return (
        <div className="space-y-3">
          <CrewTimeCard />
          <UpdatesToReviewCard />
        </div>
      );
    case "money":
      return (
        <div className="space-y-3">
          <MoneyCard />
          <BookingsCard />
          <div className="hidden md:block">
            <RevenueChart />
          </div>
        </div>
      );
    case "pastclients":
      return <PastClientsCard />;
    case "insights":
      return <InsightsCard />;
    case "recent-activity":
      return <RecentActivity />;
    case "recent-quotes":
      return <RecentQuotes />;
    case "recent-invoices":
      return <RecentInvoices />;
  }
}

/** Two columns (about 2/3 + 1/3) from 1024px; one column below that. */
function useWideLayout() {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** An optional card on the simplified layout (Customize › Optional cards). */
function renderExtra(id: SimpleExtraId): ReactNode {
  switch (id) {
    case "starting":
      return <StartingSoonCard />;
    case "activity":
      return <ClientActivityCard />;
    case "bookings":
      return <SimpleBookingsCard />;
    case "revenue":
      return <SimpleRevenueCard />;
    case "weather":
      return <SimpleWeatherRisksCard />;
    case "crew":
      // Updates waiting for review are already in Needs your attention.
      return <CrewTimeCard />;
    case "money":
      return <MoneyCard />;
    case "pastclients":
      return <PastClientsCard />;
  }
}

/**
 * The simplified Dashboard (Customize › Simplified layout). Below the
 * banner: Schedule + Ongoing projects (left, ~2/3) and Needs your attention
 * + Pipeline (right, ~1/3); optional cards stack under their own column;
 * then one Recent activity list full width. Each column stacks its own
 * cards, so nothing leaves a hole. Narrower than 1024px: one column —
 * Needs → Schedule → Ongoing → Pipeline → optional cards → Recent activity.
 */
function SimpleLayout({ extras }: { extras: SimpleExtraId[] }) {
  const wide = useWideLayout();
  const box = (title: string, node: ReactNode) => <CardErrorBoundary title={title}>{node}</CardErrorBoundary>;
  const extra = (...columns: ("left" | "right" | "full")[]) =>
    SIMPLE_EXTRAS.filter((x) => columns.includes(x.column) && extras.includes(x.id)).map((x) => (
      <CardErrorBoundary key={x.id} title={x.label}>
        <LazyMount>{renderExtra(x.id)}</LazyMount>
      </CardErrorBoundary>
    ));
  const schedule = box("Schedule", <TodayCard schedule />);
  const ongoing = box("Ongoing projects", <OngoingJobsCard simple />);
  const needs = box("Needs your attention", <NeedsYouCard simple />);
  const pipeline = box("Pipeline", <PipelineCard simple />);
  const activity = box("Recent activity", <ActivityFeedCard />);
  return (
      <div className="space-y-4">
        {wide ? (
          <div className="grid grid-cols-3 items-start gap-4">
            <div className="col-span-2 space-y-4">
              {schedule}
              {ongoing}
              {extra("left")}
            </div>
            <div className="space-y-4">
              {needs}
              {pipeline}
              {extra("right")}
            </div>
          </div>
        ) : null}
        {/* Full-width optional cards (Revenue overview), below both columns. */}
        {wide && extra("full")}
        {!wide && (
          <>
            {needs}
            {schedule}
            {ongoing}
            {pipeline}
            {/* Same order as before on one column: Revenue overview after the
                wide-column cards. */}
            {extra("left", "full")}
            {extra("right")}
          </>
        )}
        {activity}
      </div>
  );
}

function Slot({ id }: { id: CardId }) {
  const label = CARDS.find((c) => c.id === id)?.label ?? id;
  return (
    <CardErrorBoundary title={label}>
      <LazyMount eager={EAGER.has(id)}>{renderCard(id)}</LazyMount>
    </CardErrorBoundary>
  );
}

/**
 * The refreshed Dashboard — Today → Needs you → This week → Pipeline →
 * Money → Past clients & insights. Every card reads existing helpers and
 * query keys; nothing new is stored except each user's layout (this
 * browser). Lives beside the original DashboardView behind the "New
 * dashboard" switch.
 */
export function DashboardV2() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { greeting, firstName } = useGreeting();
  const { prefs, update, reset } = useDashboardPrefs();
  const [oppOpen, setOppOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices(), enabled: payOpen });

  const onError = (title: string) => (err: Error) => toast({ title, description: err.message, variant: "destructive" });
  const newQuote = useMutation({ mutationFn: () => createQuote(), onSuccess: (q) => navigate(`/quotes/${q.id}`), onError: onError("Couldn't create quote") });
  const newInvoice = useMutation({ mutationFn: () => createInvoice(), onSuccess: (i) => navigate(`/invoices/${i.id}`), onError: onError("Couldn't create invoice") });

  const visible = prefs.order.filter((id) => !prefs.hidden.includes(id));
  const mobileOrder = [...MOBILE_FIRST.filter((id) => visible.includes(id)), ...visible.filter((id) => !MOBILE_FIRST.includes(id))];
  const col = (c: "left" | "right") => visible.filter((id) => CARDS.find((x) => x.id === id)?.column === c);
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const move = (id: CardId, dir: -1 | 1) => {
    const order = [...prefs.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ order });
  };

  // The simplified layout always uses the banner (its headline tiles live there).
  const simple = prefs.layout === "simple";

  return (
    <div className="animate-fade-in space-y-3 pb-24 md:space-y-4">
      {prefs.bannerHeader || simple ? (
        // The banner (Customize › Banner header): greeting, status, actions
        // and the headline numbers — which then aren't shown again below.
        <DashboardBanner
          showTiles={!prefs.hideHeadline}
          onCustomize={() => setCustomizing(true)}
          actions={{
            onNewOpportunity: () => setOppOpen(true),
            onNewQuote: () => newQuote.mutate(),
            onNewInvoice: () => newInvoice.mutate(),
            onRecordPayment: () => setPayOpen(true),
            quotePending: newQuote.isPending,
            invoicePending: newInvoice.isPending,
          }}
        />
      ) : (
      <>
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-[26px]">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
          <p className="text-xs text-muted-foreground md:text-sm">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Customize dashboard" onClick={() => setCustomizing(true)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <Button className="col-span-2 h-11 font-bold md:order-last" onClick={() => setOppOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New opportunity
        </Button>
        <Button variant="outline" className="h-11 font-semibold" disabled={newQuote.isPending} onClick={() => newQuote.mutate()}>
          New quote
        </Button>
        <Button variant="outline" className="h-11 font-semibold" disabled={newInvoice.isPending} onClick={() => newInvoice.mutate()}>
          New invoice
        </Button>
        <Button variant="outline" className="col-span-2 h-11 font-semibold md:col-span-1" onClick={() => setPayOpen(true)}>
          Record payment
        </Button>
      </div>

      {!prefs.hideHeadline && (
        <CardErrorBoundary title="Headline numbers">
          <HeadlineStrip />
        </CardErrorBoundary>
      )}
      </>
      )}

      {simple ? (
        <SimpleLayout extras={prefs.simpleExtras} />
      ) : isMobile ? (
        <div className="space-y-3">
          {mobileOrder.map((id) => (
            <Slot key={id} id={id} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-4">
          {(["left", "right"] as const).map((c) => (
            <div key={c} className="space-y-4">
              {col(c).map((id) => (
                <Slot key={id} id={id} />
              ))}
            </div>
          ))}
        </div>
      )}

      <CreateOpportunityDialog open={oppOpen} onOpenChange={setOppOpen} />
      <RecordPaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        projectId={null}
        invoices={invoices.filter((i) => i.status === "sent" || i.status === "overdue")}
        onSaved={() => qc.invalidateQueries({ queryKey: ["payments"] })}
      />

      <Sheet open={customizing} onOpenChange={setCustomizing}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[85vh] rounded-t-2xl" : "w-full sm:max-w-sm")}>
          <SheetHeader className="text-left">
            <SheetTitle>Customize dashboard</SheetTitle>
            <SheetDescription>{simple ? "Turn optional cards on or off." : "Show, hide and reorder cards."} Saved for you on this device.</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 divide-y divide-hairline">
            <li className="flex min-h-[48px] items-center gap-3">
              <span className="flex-1 text-sm font-semibold">
                Simplified layout <span className="ml-1 text-[10px] font-normal text-muted-subtle">new</span>
              </span>
              <Switch checked={simple} onCheckedChange={(v) => update({ layout: v ? "simple" : "classic" })} aria-label="Use the simplified layout" />
            </li>
            {!simple && (
              <li className="flex min-h-[48px] items-center gap-3">
                <span className="flex-1 text-sm font-semibold">
                  Banner header <span className="ml-1 text-[10px] font-normal text-muted-subtle">new</span>
                </span>
                <Switch checked={prefs.bannerHeader} onCheckedChange={(v) => update({ bannerHeader: v })} aria-label="Show the banner header" />
              </li>
            )}
            <li className="flex min-h-[48px] items-center gap-3">
              <span className="flex-1 text-sm font-semibold">Headline numbers</span>
              <Switch checked={!prefs.hideHeadline} onCheckedChange={(v) => update({ hideHeadline: !v })} aria-label="Show headline numbers" />
            </li>
            {simple && <li className="pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Optional cards</li>}
            {simple &&
              SIMPLE_EXTRAS.map(({ id, label, column }) => {
                const on = prefs.simpleExtras.includes(id);
                return (
                  <li key={id} className="flex min-h-[48px] items-center gap-3">
                    <span className={cn("flex-1 text-sm", on ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {label}
                      <span className="ml-1 text-[10px] font-normal text-muted-subtle">{column === "left" ? "wide column" : column === "right" ? "narrow column" : "full width"}</span>
                    </span>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => update({ simpleExtras: v ? [...prefs.simpleExtras, id] : prefs.simpleExtras.filter((x) => x !== id) })}
                      aria-label={`Show ${label}`}
                    />
                  </li>
                );
              })}
            {!simple && prefs.order.map((id, i) => {
              const card = CARDS.find((c) => c.id === id)!;
              const shown = !prefs.hidden.includes(id);
              return (
                <li key={id} className="flex min-h-[48px] items-center gap-2">
                  <span className={cn("flex-1 text-sm", shown ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {card.label}
                    <span className="ml-1 text-[10px] text-muted-subtle">{card.column === "left" ? "left" : "right"}</span>
                  </span>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${card.label} up`}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={i === prefs.order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${card.label} down`}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={shown}
                    onCheckedChange={(v) => update({ hidden: v ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] })}
                    aria-label={`Show ${card.label}`}
                  />
                </li>
              );
            })}
          </ul>
          <Button variant="outline" className="mt-4 h-11 w-full" onClick={reset}>
            Reset to default
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

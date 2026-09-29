import { useState, type ReactNode } from "react";
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
import { CARDS, type CardId, useDashboardPrefs } from "./prefs";
import { TodayCard } from "./TodayCard";
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

  return (
    <div className="mx-auto max-w-[1200px] animate-fade-in space-y-3 pb-24 md:space-y-4">
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

      {isMobile ? (
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
            <SheetDescription>Show, hide and reorder cards. Saved for you on this device.</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 divide-y divide-hairline">
            <li className="flex min-h-[48px] items-center gap-3">
              <span className="flex-1 text-sm font-semibold">Headline numbers</span>
              <Switch checked={!prefs.hideHeadline} onCheckedChange={(v) => update({ hideHeadline: !v })} aria-label="Show headline numbers" />
            </li>
            {prefs.order.map((id, i) => {
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

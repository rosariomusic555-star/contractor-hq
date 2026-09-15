import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RecentQuotes } from "@/components/dashboard/RecentQuotes";
import { RecentInvoices } from "@/components/dashboard/RecentInvoices";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { OngoingJobsCard } from "@/components/dashboard/OngoingJobsCard";
import { NeedsYou } from "@/components/dashboard/NeedsYou";
import { FollowUpsCard } from "@/components/dashboard/FollowUpsCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";
import { listQuotes, listInvoices, createQuote, createInvoice } from "@/lib/api";
import { monthlyRevenue } from "@/lib/metrics";
import { overdueCount } from "@/lib/aging";
import { DEMO_REVENUE_GOAL } from "@/lib/demoData";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Wraps a KpiCard so it's clickable — keeps the card's own look, just adds
 * a hover lift + focus ring since it's now a real link. */
const KPI_LINK_CLASS =
  "group block rounded-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function DashboardView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();

  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const newQuoteMut = useMutation({
    mutationFn: () => createQuote(),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  const newInvoiceMut = useMutation({
    mutationFn: () => createInvoice(),
    onSuccess: (invoice) => navigate(`/invoices/${invoice.id}`),
    onError: (err: Error) =>
      toast({ title: "Couldn't create invoice", description: err.message, variant: "destructive" }),
  });

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const sumFor = (m: string) =>
    invoices.filter((i) => i.created_at.slice(0, 7) === m).reduce((s, i) => s + Number(i.amount), 0);

  const thisMonthRevenue = sumFor(thisMonth);
  const lastMonthRevenue = sumFor(lastMonth);
  const momChange =
    lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : null;

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const awaitingResponse = quotes.filter((q) => q.status === "sent").length;
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const outstandingTotal = outstanding.reduce((s, i) => s + Number(i.amount), 0);
  const over30 = overdueCount(invoices, 30, now);

  const goalPct = Math.min(100, Math.round((thisMonthRevenue / DEMO_REVENUE_GOAL) * 100));
  const spark = monthlyRevenue(invoices).slice(-7);
  const sparkMax = Math.max(1, ...spark.map((p) => p.revenue));

  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const initials = (session?.user.email ?? "?").slice(0, 2).toUpperCase();

  const momPill =
    momChange == null ? null : (
      <span
        className={cn(
          "inline-flex items-center gap-0.5",
          momChange >= 0 ? "text-success" : "text-destructive",
        )}
      >
        {momChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {momChange >= 0 ? "+" : ""}
        {momChange.toFixed(1)}% vs last month
      </span>
    );

  return (
    <div className="animate-fade-in space-y-6">
      {/* ---- Mobile slate header ---- */}
      <div className="mobile-header -mx-4 -mt-4 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sidebar-foreground/70">
              {dateLabel}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{greeting()}</h1>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-sidebar-primary text-sm font-extrabold text-sidebar-primary-foreground shadow-sm ring-1 ring-white/10">
            {initials}
          </span>
        </div>
      </div>

      {/* ---- Desktop header ---- */}
      <PageHeader
        title="Dashboard"
        subtitle={`${dateLabel} · here's your business overview`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => newInvoiceMut.mutate()}
              disabled={newInvoiceMut.isPending}
              className="border-border font-semibold"
            >
              New invoice
            </Button>
            <Button
              onClick={() => newQuoteMut.mutate()}
              disabled={newQuoteMut.isPending}
              className="font-bold"
            >
              New quote
            </Button>
          </>
        }
      />

      {/* ---- Desktop KPI row ---- */}
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        <Link to="/revenue" className={KPI_LINK_CLASS}>
          <KpiCard
            label="This month"
            value={formatCurrency(thisMonthRevenue)}
            sub={momPill ?? "Revenue invoiced"}
            subTone={momChange == null ? "muted" : momChange >= 0 ? "positive" : "negative"}
            clickable
          />
        </Link>
        <Link to="/quotes?filter=open" className={KPI_LINK_CLASS}>
          <KpiCard
            label="Open quotes"
            value={openQuotes.length}
            sub={`${awaitingResponse} awaiting reply`}
            clickable
          />
        </Link>
        <Link to="/invoices?filter=unpaid" className={KPI_LINK_CLASS}>
          <KpiCard
            label="Unpaid"
            value={formatCurrency(outstandingTotal)}
            sub={over30 > 0 ? `${over30} over 30 days` : `${outstanding.length} outstanding`}
            subTone={over30 > 0 ? "negative" : "muted"}
            clickable
          />
        </Link>
      </div>

      {/* ---- Mobile revenue card ---- */}
      <Link to="/revenue" className="group block md:hidden">
        <section className="card-surface p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-muted-foreground">This month</p>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
            {formatCurrency(thisMonthRevenue)}
          </p>
          {momPill && <p className="mt-1.5 text-xs font-bold">{momPill}</p>}

          {spark.length > 1 && (
            <div className="mt-4 flex h-12 items-end gap-1.5">
              {spark.map((p, i) => (
                <div
                  key={p.key}
                  className={cn(
                    "flex-1 rounded",
                    i === spark.length - 1 ? "bg-primary" : "bg-muted",
                  )}
                  style={{ height: `${Math.max(6, (p.revenue / sparkMax) * 100)}%` }}
                />
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{goalPct}% of {formatCurrency(DEMO_REVENUE_GOAL)} goal</span>
            <span className="text-foreground">
              {formatCurrency(Math.max(0, DEMO_REVENUE_GOAL - thisMonthRevenue))} to go
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
        </section>
      </Link>

      {/* ---- Mobile tiles ---- */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Link to="/quotes?filter=open" className={KPI_LINK_CLASS}>
          <KpiCard
            label="Open quotes"
            value={openQuotes.length}
            sub={`${awaitingResponse} awaiting reply`}
            clickable
          />
        </Link>
        <Link to="/invoices?filter=unpaid" className={KPI_LINK_CLASS}>
          <KpiCard
            label="Unpaid"
            value={formatCurrency(outstandingTotal)}
            sub={over30 > 0 ? `${over30} over 30 days` : `${outstanding.length} outstanding`}
            subTone={over30 > 0 ? "negative" : "muted"}
            clickable
          />
        </Link>
      </div>

      {/* ---- Desktop chart + ongoing jobs ---- */}
      <div className="hidden grid-cols-1 gap-5 md:grid lg:grid-cols-3">
        <RevenueChart className="lg:col-span-2" />
        <OngoingJobsCard />
      </div>

      {/* ---- Mobile: ongoing jobs ---- */}
      <OngoingJobsCard className="md:hidden" />

      {/* ---- Follow-ups + Needs you ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <FollowUpsCard />
        <NeedsYou />
      </div>

      {/* ---- Recent activity ---- */}
      <RecentActivity />

      {/* ---- Recent quotes + recent invoices ---- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <RecentQuotes />
        <RecentInvoices />
      </div>
    </div>
  );
}

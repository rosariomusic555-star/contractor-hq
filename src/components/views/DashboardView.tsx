import { DollarSign, FileText, Receipt, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { listQuotes, listInvoices } from "@/lib/api";

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`;
const count = (n: number) => String(Math.round(n));
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function DashboardView() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const sumFor = (m: string) =>
    invoices
      .filter((i) => i.created_at.slice(0, 7) === m)
      .reduce((s, i) => s + Number(i.amount), 0);

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const thisMonthRevenue = sumFor(thisMonth);
  const lastMonthRevenue = sumFor(lastMonth);
  const momChange =
    lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : null;

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const awaitingResponse = quotes.filter((q) => q.status === "sent").length;

  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const outstandingTotal = outstanding.reduce((s, i) => s + Number(i.amount), 0);

  const todayLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Welcome back! Here's your business overview.</p>
        </div>
        <span className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {todayLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <DashboardStatCard
          title="Total Revenue"
          value={totalRevenue}
          format={currency}
          trend={momChange}
          hint={momChange == null ? "All time" : "vs last month"}
          icon={DollarSign}
          accent="green"
          to="/revenue"
          delay={0}
        />
        <DashboardStatCard
          title="Open Quotes"
          value={openQuotes.length}
          format={count}
          hint={`${awaitingResponse} awaiting response`}
          icon={FileText}
          accent="grey"
          to="/quotes"
          delay={70}
        />
        <DashboardStatCard
          title="Outstanding Invoices"
          value={outstandingTotal}
          format={currency}
          hint={`${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} pending`}
          icon={Receipt}
          accent="amber"
          to="/invoices"
          delay={140}
        />
        <DashboardStatCard
          title="This Month"
          value={thisMonthRevenue}
          format={currency}
          trend={momChange}
          hint={momChange == null ? "Revenue this month" : "vs last month"}
          icon={TrendingUp}
          accent="green"
          to="/revenue"
          delay={210}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <RevenueChart />
        <div className="space-y-5">
          <QuickActions />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

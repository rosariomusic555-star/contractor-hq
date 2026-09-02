import { DollarSign, FileText, Receipt, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { listQuotes, listInvoices } from "@/lib/api";

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`;
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function DashboardView() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: listQuotes });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: listInvoices });

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const sumFor = (m: string) =>
    invoices
      .filter((i) => i.issue_date.slice(0, 7) === m)
      .reduce((s, i) => s + Number(i.amount), 0);

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const thisMonthRevenue = sumFor(thisMonth);
  const lastMonthRevenue = sumFor(lastMonth);
  const momChange =
    lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : null;

  const activeQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const pendingApproval = quotes.filter((q) => q.status === "sent").length;

  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const outstandingTotal = outstanding.reduce((s, i) => s + Number(i.amount), 0);

  const momText =
    momChange == null ? null : `${momChange >= 0 ? "+" : ""}${momChange.toFixed(1)}% from last month`;
  const momType: "positive" | "negative" | "neutral" =
    momChange == null ? "neutral" : momChange >= 0 ? "positive" : "negative";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here's your business overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={currency(totalRevenue)}
          change={momText ?? "All time"}
          changeType={momText ? momType : "neutral"}
          icon={DollarSign}
          iconColor="text-success"
        />
        <StatCard
          title="Active Quotes"
          value={String(activeQuotes.length)}
          change={`${pendingApproval} pending approval`}
          changeType="neutral"
          icon={FileText}
          iconColor="text-primary"
        />
        <StatCard
          title="Outstanding Invoices"
          value={currency(outstandingTotal)}
          change={`${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} pending`}
          changeType="neutral"
          icon={Receipt}
          iconColor="text-warning"
        />
        <StatCard
          title="This Month"
          value={currency(thisMonthRevenue)}
          change={momText ?? "Revenue this month"}
          changeType={momText ? momType : "neutral"}
          icon={TrendingUp}
          iconColor="text-accent"
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <RevenueChart />
        <div className="space-y-4 md:space-y-6">
          <QuickActions />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

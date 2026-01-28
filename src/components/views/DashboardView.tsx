import { DollarSign, FileText, Receipt, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RevenueChart } from "@/components/dashboard/RevenueChart";

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
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
          value="$42,850"
          change="+12.5% from last month"
          changeType="positive"
          icon={DollarSign}
          iconColor="text-success"
        />
        <StatCard
          title="Active Quotes"
          value="8"
          change="3 pending approval"
          changeType="neutral"
          icon={FileText}
          iconColor="text-primary"
        />
        <StatCard
          title="Outstanding Invoices"
          value="$18,420"
          change="5 invoices pending"
          changeType="neutral"
          icon={Receipt}
          iconColor="text-warning"
        />
        <StatCard
          title="This Month"
          value="$12,650"
          change="+8.3% from target"
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-accent"
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <RevenueChart />
        <div className="space-y-4 md:space-y-6">
          <QuickActions 
            onCreateQuote={() => onNavigate("quotes")} 
            onCreateInvoice={() => onNavigate("invoices")} 
          />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

import { FileText, Receipt, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { listQuotes, listInvoices, type Quote, type Invoice } from "@/lib/api";

type ActivityType = "quote" | "invoice" | "payment";
type ActivityStatus = "completed" | "pending" | "overdue";

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  client: string;
  amount: number;
  status: ActivityStatus;
  createdAt: string;
}

const iconMap: Record<ActivityType, typeof FileText> = {
  quote: FileText,
  invoice: Receipt,
  payment: CheckCircle,
};

const statusConfig: Record<ActivityStatus, { icon: typeof CheckCircle; class: string }> = {
  completed: { icon: CheckCircle, class: "text-success" },
  pending: { icon: Clock, class: "text-warning" },
  overdue: { icon: AlertCircle, class: "text-destructive" },
};

const quoteTitle: Record<Quote["status"], string> = {
  draft: "Quote created",
  sent: "Quote sent",
  approved: "Quote approved",
  rejected: "Quote rejected",
};

const quoteStatus: Record<Quote["status"], ActivityStatus> = {
  draft: "pending",
  sent: "pending",
  approved: "completed",
  rejected: "overdue",
};

const invoiceTitle: Record<Invoice["status"], string> = {
  draft: "Invoice created",
  sent: "Invoice sent",
  paid: "Payment received",
  overdue: "Invoice overdue",
};

const invoiceStatus: Record<Invoice["status"], ActivityStatus> = {
  draft: "pending",
  sent: "pending",
  paid: "completed",
  overdue: "overdue",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = seconds;
  for (const [size, label] of units) {
    if (value < size) {
      const rounded = Math.floor(value);
      if (label === "second") return "just now";
      return `${rounded} ${label}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return "just now";
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RecentActivity() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: listQuotes });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: listInvoices });

  const activities: Activity[] = [
    ...quotes.map<Activity>((q) => ({
      id: `quote-${q.id}`,
      type: "quote",
      title: quoteTitle[q.status],
      client: q.client,
      amount: Number(q.amount),
      status: quoteStatus[q.status],
      createdAt: q.created_at,
    })),
    ...invoices.map<Activity>((i) => ({
      id: `invoice-${i.id}`,
      type: i.status === "paid" ? "payment" : "invoice",
      title: invoiceTitle[i.status],
      client: i.client,
      amount: Number(i.amount),
      status: invoiceStatus[i.status],
      createdAt: i.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
        {activities.map((activity) => {
          const Icon = iconMap[activity.type];
          const StatusIcon = statusConfig[activity.status].icon;

          return (
            <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="p-2 rounded-lg bg-muted">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{activity.title}</p>
                  <StatusIcon className={cn("w-4 h-4", statusConfig[activity.status].class)} />
                </div>
                <p className="text-sm text-muted-foreground">{activity.client}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{money(activity.amount)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(activity.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { FileText, Receipt, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listQuotes, listInvoices, quoteTotal, type Quote, type Invoice } from "@/lib/api";

type ActivityType = "quote" | "invoice" | "payment";
type ActivityStatus = "completed" | "pending" | "overdue";

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  amount: number;
  status: ActivityStatus;
  createdAt: string;
  // Quote builder for quotes; invoice detail for both invoices and
  // payments (a payment is just a paid invoice).
  linkTo: string;
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
  draft: "Quote drafted",
  sent: "Quote sent",
  approved: "Quote approved",
};

const quoteStatus: Record<Quote["status"], ActivityStatus> = {
  draft: "pending",
  sent: "pending",
  approved: "completed",
};

const invoiceTitle: Record<Invoice["status"], string> = {
  draft: "Invoice drafted",
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

const projectLabel = (project?: { name: string; client: { name: string } | null } | null) =>
  project?.client?.name ?? project?.name ?? "—";

export function RecentActivity() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const activities: Activity[] = [
    ...quotes.map<Activity>((q) => ({
      id: `quote-${q.id}`,
      type: "quote",
      title: quoteTitle[q.status],
      subtitle: projectLabel(q.project),
      amount: quoteTotal(q.quote_sections),
      status: quoteStatus[q.status],
      createdAt: q.created_at,
      linkTo: `/quotes/${q.id}`,
    })),
    ...invoices.map<Activity>((i) => ({
      id: `invoice-${i.id}`,
      type: i.status === "paid" ? "payment" : "invoice",
      title: invoiceTitle[i.status],
      subtitle: projectLabel(i.project),
      amount: Number(i.amount),
      status: invoiceStatus[i.status],
      createdAt: i.created_at,
      linkTo: `/invoices/${i.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_3px_0_hsl(215_25%_15%/0.06)]">
      <h3 className="mb-4 text-base font-semibold text-foreground">Recent Activity</h3>
      <div className="space-y-1">
        {activities.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No activity yet.</p>
        )}
        {activities.map((activity, i) => {
          const Icon = iconMap[activity.type];
          const StatusIcon = statusConfig[activity.status].icon;

          return (
            <Link
              key={activity.id}
              to={activity.linkTo}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group flex animate-fade-in items-center gap-3 rounded-xl p-3 transition-all duration-200 [animation-fill-mode:backwards] hover:bg-muted/60 hover:translate-x-0.5"
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  activity.type === "quote" && "bg-primary/15 text-primary",
                  activity.type === "invoice" && "bg-[#687B85]/15 text-[#687B85]",
                  activity.type === "payment" && "bg-success/15 text-success",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-foreground">{activity.title}</p>
                  <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusConfig[activity.status].class)} />
                </div>
                <p className="truncate text-xs text-muted-foreground">{activity.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">{money(activity.amount)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(activity.createdAt)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

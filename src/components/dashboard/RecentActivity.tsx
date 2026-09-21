import { FileText, Receipt, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn, formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
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
  linkTo: string;
}

const iconMap: Record<ActivityType, typeof FileText> = {
  quote: FileText,
  invoice: Receipt,
  payment: CheckCircle2,
};

const chipClass: Record<ActivityType, string> = {
  quote: "bg-primary/15 text-primary",
  invoice: "bg-info/15 text-info",
  payment: "bg-success/15 text-success",
};

const statusConfig: Record<ActivityStatus, { icon: typeof CheckCircle2; class: string }> = {
  completed: { icon: CheckCircle2, class: "text-success" },
  pending: { icon: Clock, class: "text-warning" },
  overdue: { icon: AlertCircle, class: "text-destructive" },
};

const quoteTitle: Record<Quote["status"], string> = {
  draft: "Quote drafted",
  sent: "Quote shared",
  approved: "Quote approved",
  declined: "Quote declined",
  not_selected: "Quote option not selected",
};

const quoteStatus: Record<Quote["status"], ActivityStatus> = {
  draft: "pending",
  sent: "pending",
  approved: "completed",
  declined: "overdue",
  not_selected: "completed",
};

const invoiceTitle: Record<Invoice["status"], string> = {
  draft: "Invoice drafted",
  sent: "Invoice shared",
  paid: "Payment received",
  overdue: "Invoice overdue",
};

const invoiceStatus: Record<Invoice["status"], ActivityStatus> = {
  draft: "pending",
  sent: "pending",
  paid: "completed",
  overdue: "overdue",
};

const projectLabel = (project?: { name: string; client: { name: string } | null } | null) =>
  project?.client?.name ?? project?.name ?? "—";

export function RecentActivity({ className }: { className?: string }) {
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
    .slice(0, 6);

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="mb-3 text-base font-bold text-foreground">Recent activity</h3>
      {activities.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {activities.map((activity) => {
            const Icon = iconMap[activity.type];
            const StatusIcon = statusConfig[activity.status].icon;
            return (
              <li key={activity.id}>
                <Link
                  to={activity.linkTo}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      chipClass[activity.type],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <span className="truncate">{activity.title}</span>
                      <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusConfig[activity.status].class)} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{activity.subtitle}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {formatCurrency(activity.amount)}
                    </p>
                    <p className="text-[11px] text-muted-subtle">{timeAgo(activity.createdAt)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

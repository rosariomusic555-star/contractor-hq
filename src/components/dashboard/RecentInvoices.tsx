import { Receipt, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn, formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { listInvoices, type Invoice } from "@/lib/api";

const STATUS_ICON: Record<Invoice["status"], typeof CheckCircle2> = {
  draft: Clock,
  sent: Clock,
  paid: CheckCircle2,
  overdue: AlertCircle,
};

const STATUS_ICON_CLASS: Record<Invoice["status"], string> = {
  draft: "text-muted-foreground",
  sent: "text-warning",
  paid: "text-success",
  overdue: "text-destructive",
};

export function RecentInvoices({ className }: { className?: string }) {
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const recent = [...invoices].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="mb-3 text-base font-bold text-foreground">Recent invoices</h3>
      {recent.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((i) => {
            const StatusIcon = STATUS_ICON[i.status];
            return (
              <li key={i.id}>
                <Link
                  to={`/invoices/${i.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">
                    <Receipt className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <span className="truncate">{i.project?.name ?? "Standalone"}</span>
                      <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", STATUS_ICON_CLASS[i.status])} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.project?.client?.name ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {formatCurrency(Number(i.amount))}
                    </p>
                    <p className="text-[11px] text-muted-subtle">{timeAgo(i.updated_at)}</p>
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

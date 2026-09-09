import { FileText, CheckCircle2, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn, formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { listQuotes, quoteTotal, type Quote } from "@/lib/api";

const STATUS_ICON: Record<Quote["status"], typeof CheckCircle2> = {
  draft: Clock,
  sent: Clock,
  approved: CheckCircle2,
};

const STATUS_ICON_CLASS: Record<Quote["status"], string> = {
  draft: "text-muted-foreground",
  sent: "text-warning",
  approved: "text-success",
};

const clientOf = (q: Quote) => q.client?.name ?? q.project?.client?.name ?? "—";

export function RecentQuotes({ className }: { className?: string }) {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });

  const recent = [...quotes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="mb-3 text-base font-bold text-foreground">Recent quotes</h3>
      {recent.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No quotes yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((q) => {
            const StatusIcon = STATUS_ICON[q.status];
            return (
              <li key={q.id}>
                <Link
                  to={`/quotes/${q.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <span className="truncate">{q.project?.name ?? "Standalone quote"}</span>
                      <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", STATUS_ICON_CLASS[q.status])} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{clientOf(q)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {formatCurrency(quoteTotal(q.quote_sections))}
                    </p>
                    <p className="text-[11px] text-muted-subtle">{timeAgo(q.updated_at)}</p>
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

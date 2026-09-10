import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { listInvoices, listQuotes, quoteTotal, type Invoice, type Quote } from "@/lib/api";
import { invoiceDaysLate } from "@/lib/aging";

// Thresholds — confirmed 2026-09-09. Overdue invoices flag once 3+ days
// past due; shared quotes flag once 3+ days old with no response.
const OVERDUE_DAYS_THRESHOLD = 3;
const FOLLOWUP_DAYS_THRESHOLD = 3;
const DAY = 86_400_000;

type Tone = "red" | "grey" | "green";

interface NeedsYouItem {
  key: string;
  tone: Tone;
  title: string;
  subtitle: string;
  action: string;
  href: string;
  sortValue: number;
}

const toneChip: Record<Tone, string> = {
  red: "bg-destructive/15 text-destructive",
  grey: "bg-muted text-muted-foreground",
  green: "bg-success/15 text-success",
};

const toneIcon: Record<Tone, typeof AlertCircle> = {
  red: AlertCircle,
  grey: FileText,
  green: CheckCircle2,
};

const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);

/**
 * Overdue-invoice reminders: unpaid invoices (sent/overdue) more than
 * OVERDUE_DAYS_THRESHOLD days past their due date.
 */
function overdueInvoiceItems(invoices: Invoice[], now: Date): NeedsYouItem[] {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .map((i) => ({ invoice: i, late: invoiceDaysLate(i, now) }))
    .filter(({ late }) => late >= OVERDUE_DAYS_THRESHOLD)
    .sort((a, b) => b.late - a.late)
    .map(({ invoice, late }) => ({
      key: `invoice-${invoice.id}`,
      tone: "red" as const,
      title: `Invoice ${pluralize(late, "day")} late`,
      subtitle: `${invoice.project?.name ?? "Standalone"} · ${formatCurrency(Number(invoice.amount))}`,
      action: "Remind",
      href: `/invoices/${invoice.id}`,
      sortValue: 3_000 + late,
    }));
}

/**
 * Quote follow-ups: shared quotes (status 'sent') with no response for more
 * than FOLLOWUP_DAYS_THRESHOLD days. `updated_at` is the best available
 * proxy for "days since shared" — there's no dedicated sent_at column, so a
 * quote edited after sharing (still unread by the client) would reset the
 * clock. Good enough for a nudge threshold.
 */
function quoteFollowUpItems(quotes: Quote[], now: Date): NeedsYouItem[] {
  return quotes
    .filter((q) => q.status === "sent")
    .map((q) => ({ quote: q, since: daysSince(q.updated_at, now) }))
    .filter(({ since }) => since >= FOLLOWUP_DAYS_THRESHOLD)
    .sort((a, b) => b.since - a.since)
    .map(({ quote, since }) => ({
      key: `quote-followup-${quote.id}`,
      tone: "grey" as const,
      title: `Quote shared ${pluralize(since, "day")} ago`,
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${formatCurrency(quoteTotal(quote.quote_sections))}`,
      action: "Follow up",
      href: `/quotes/${quote.id}`,
      sortValue: 2_000 + since,
    }));
}

/**
 * Deposit prompts: approved quotes with no invoice logged yet, either
 * directly (invoice.quote_id) or via the shared project (an invoice created
 * without an explicit quote_id still counts as billing that project).
 */
function depositItems(quotes: Quote[], invoices: Invoice[]): NeedsYouItem[] {
  const billed = new Set<string>();
  for (const inv of invoices) {
    if (inv.quote_id) billed.add(`quote:${inv.quote_id}`);
    if (inv.project_id) billed.add(`project:${inv.project_id}`);
  }
  return quotes
    .filter((q) => q.status === "approved")
    .filter((q) => !billed.has(`quote:${q.id}`) && !(q.project_id && billed.has(`project:${q.project_id}`)))
    .map((quote) => ({
      key: `deposit-${quote.id}`,
      tone: "green" as const,
      title: "Quote approved — needs deposit",
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${quote.deposit_percentage}% of ${formatCurrency(
        quoteTotal(quote.quote_sections),
      )}`,
      action: "Bill",
      href: `/quotes/${quote.id}`,
      sortValue: 1_000,
    }));
}

/** "Needs you" action queue — overdue chases, quote follow-ups, deposit prompts. */
export function NeedsYou({ className }: { className?: string }) {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const now = new Date();
  const items = [
    ...overdueInvoiceItems(invoices, now),
    ...depositItems(quotes, invoices),
    ...quoteFollowUpItems(quotes, now),
  ].sort((a, b) => b.sortValue - a.sortValue);

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="text-base font-bold text-foreground">
        Needs you <span className="text-muted-foreground">· {items.length}</span>
      </h3>

      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing needs your attention.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {items.map((item) => {
            const Icon = toneIcon[item.tone];
            return (
              <li key={item.key}>
                <Link
                  to={item.href}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      toneChip[item.tone],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">
                    {item.action}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

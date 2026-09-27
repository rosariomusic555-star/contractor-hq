import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listAppointments, listInvoices, listOpportunities, listQuotes } from "@/lib/api";
import { buildNeedsYouItems } from "@/lib/needsYou";
import { useReviewNeedsYou } from "@/components/reviews/useReviewNeedsYou";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";

const MAX_ITEMS = 5;

/** "Needs you" action queue — site visits to confirm, overdue chases, quote
 * follow-ups, deposit prompts. Capped to the 5 most urgent; see /needs-you (NeedsYouView) for
 * the full, uncapped list — same buildNeedsYouItems() source, same order. */
export function NeedsYou({ className }: { className?: string }) {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  // Review requests (0122) — "Ask Greg Gray for a review" / "Remind Greg…".
  const reviews = useReviewNeedsYou();

  const items = buildNeedsYouItems(quotes, invoices, undefined, { opportunities, appointments }, reviews);
  const shown = items.slice(0, MAX_ITEMS);

  return (
    <section className={cn("card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Needs you <span className="text-muted-foreground">· {items.length}</span>
        </h3>
        {items.length > MAX_ITEMS && (
          <Link to="/needs-you" className="text-[13px] font-semibold text-primary hover:text-primary/80">
            View all
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing needs your attention.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {shown.map((item) => (
            <li key={item.key}>
              <NeedsYouRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

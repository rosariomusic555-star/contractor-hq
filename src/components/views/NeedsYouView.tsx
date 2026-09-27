import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";
import { listAppointments, listInvoices, listOpportunities, listQuotes } from "@/lib/api";
import { buildNeedsYouItems } from "@/lib/needsYou";
import { useReviewNeedsYou } from "@/components/reviews/useReviewNeedsYou";
import { BackLink } from "@/components/common/BackLink";

/** Full, uncapped "Needs you" queue — the Dashboard card (NeedsYou.tsx)
 * shows the 5 most urgent of this same list and links here for the rest.
 * Same buildNeedsYouItems() source, same sort, so the two never disagree. */
export function NeedsYouView() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  // Review requests (0122) — "Ask Greg Gray for a review" / "Remind Greg…".
  const reviews = useReviewNeedsYou();

  const items = buildNeedsYouItems(quotes, invoices, undefined, { opportunities, appointments }, reviews);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Needs you" back={{ to: "/dashboard", label: "Dashboard" }} />

      <div className="hidden md:block">
        <BackLink
          to="/dashboard"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Dashboard</BackLink>
      </div>
      <PageHeader title="Needs you" subtitle={`${items.length} ${items.length === 1 ? "item" : "items"} needing attention, most urgent first`} />

      <section className="card-surface p-5">
        {items.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nothing needs your attention.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {items.map((item) => (
              <li key={item.key}>
                <NeedsYouRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";
import { listInvoices, listQuotes } from "@/lib/api";
import { buildNeedsYouItems } from "@/lib/needsYou";

/** Full, uncapped "Needs you" queue — the Dashboard card (NeedsYou.tsx)
 * shows the 5 most urgent of this same list and links here for the rest.
 * Same buildNeedsYouItems() source, same sort, so the two never disagree. */
export function NeedsYouView() {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const items = buildNeedsYouItems(quotes, invoices);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Needs you" back={{ to: "/dashboard", label: "Dashboard" }} />

      <div className="hidden md:block">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
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

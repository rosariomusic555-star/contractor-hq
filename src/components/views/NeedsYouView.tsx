import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";
import { BackLink } from "@/components/common/BackLink";
import { NeedsYouChips } from "@/components/dashboard/NeedsYouChips";
import { useNeedsYouItems } from "@/components/dashboard/useNeedsYouItems";
import { categoryOf, type NeedsYouCategory } from "@/lib/needsYou";

/** Full, uncapped "Needs you" queue — the Dashboard cards show the 5 most
 * urgent of this same list (useNeedsYouItems) and link here for the rest,
 * so they never disagree. Filter chips: All / Jobs / Money / Clients / Crew. */
export function NeedsYouView() {
  const { items: all } = useNeedsYouItems();
  const [filter, setFilter] = useState<NeedsYouCategory | "all">("all");
  const items = filter === "all" ? all : all.filter((i) => categoryOf(i) === filter);
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Needs you" back={{ to: "/dashboard", label: "Dashboard" }} />

      <div className="hidden md:block">
        <BackLink
          to="/dashboard"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Dashboard</BackLink>
      </div>
      <PageHeader title="Needs you" subtitle={`${all.length} ${all.length === 1 ? "item" : "items"} needing attention, most urgent first`} />

      <NeedsYouChips items={all} value={filter} onChange={setFilter} />

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

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NeedsYouRow } from "@/components/common/NeedsYouRow";
import { useNeedsYouItems } from "./useNeedsYouItems";
import { useCardLink } from "@/hooks/use-card-link";

const MAX_ITEMS = 5;

/** "Needs you" action queue — site visits to confirm, overdue chases, quote
 * follow-ups, deposit prompts. Capped to the 5 most urgent; see /needs-you (NeedsYouView) for
 * the full, uncapped list — same buildNeedsYouItems() source, same order. */
export function NeedsYou({ className }: { className?: string }) {
  const cardLink = useCardLink("/needs-you");
  // Every feature's action items (useNeedsYouItems) — same list as /needs-you.
  const { items } = useNeedsYouItems();
  const shown = items.slice(0, MAX_ITEMS);

  return (
    <section onClick={cardLink.onClick} className={cn(cardLink.className, "card-surface p-5", className)}>
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

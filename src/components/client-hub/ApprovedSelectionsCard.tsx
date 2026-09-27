import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { approvedSelections } from "@/lib/projectHistory";
import { priceLabel } from "@/lib/selections";

/** Client Hub / Client view: the approved selections (0115), locked, with
 * their history — "Request a change" lives on the quote's page. */
export function ApprovedSelectionsCard({ detail, docBase }: { detail: PortalProjectDetail; docBase: string }) {
  const rows = approvedSelections(detail);
  if (!rows.length) return null;
  return (
    <section className="card-surface p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Lock className="h-4 w-4 text-muted-subtle" />
        Your selections
      </h3>
      <ul className="mt-2 divide-y divide-hairline">
        {rows.map((r, i) => (
          <li key={i} className="py-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                {r.section} · {r.group}
              </span>
              <span className="text-right font-semibold text-foreground">
                {r.choices.join(", ") || "—"}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{priceLabel(r.price)}</span>
              </span>
            </div>
            {r.history && <p className="mt-0.5 text-xs text-muted-subtle">{r.history}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Want to change something?{" "}
        <Link to={`${docBase}/quote/${rows[0].quoteId}`} className="font-semibold text-primary hover:underline">
          Open your quote
        </Link>{" "}
        and tap "Request a change".
      </p>
    </section>
  );
}

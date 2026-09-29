import type { SharedBusiness } from "@/lib/api";

/** The contractor's name + contact line at the top of a public share page
 * (quote / invoice / change order, 0150). Nothing when no company name is
 * set — never the app's own name. */
export function SharedBusinessHeader({ business }: { business?: SharedBusiness | null }) {
  const name = business?.company_name?.trim();
  if (!name) return null;
  const contact = [business?.phone, business?.email].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold tracking-wide text-primary [overflow-wrap:anywhere]">{name}</p>
      {contact && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{contact}</p>}
    </div>
  );
}

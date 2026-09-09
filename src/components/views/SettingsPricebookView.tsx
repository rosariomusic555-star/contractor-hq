import { Link } from "react-router-dom";
import { ChevronLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { formatCurrency } from "@/lib/utils";

/** Placeholder catalog — not backed by any table yet. */
const CATALOG = [
  { id: "stone", name: "3\" crushed stone", unit: "per ton", price: 42 },
  { id: "paver-base", name: "Paver base", unit: "per sf", price: 6.5 },
  { id: "wall-block", name: "Retaining wall block", unit: "per unit", price: 4.25 },
  { id: "polymeric-sand", name: "Polymeric sand", unit: "per bag", price: 38 },
  { id: "labor-general", name: "Labor — general", unit: "per hour", price: 65 },
  { id: "labor-crew-lead", name: "Labor — crew lead", unit: "per hour", price: 85 },
] as const;

/** Placeholder — no company-wide pricebook table exists yet (distinct from
 * the per-project Materials Sheet at /projects/:id/materials). */
export function SettingsPricebookView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Pricebook & materials" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Pricebook & materials</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold text-background">Standard catalog items</span>
          </div>
          <span className="text-xs font-semibold text-background/70">{CATALOG.length} items</span>
        </div>

        <div className="divide-y divide-hairline bg-card px-5">
          {CATALOG.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.unit}</div>
              </div>
              <div className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(item.price)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        These items are for reference only — quotes and the Materials Sheet don't pull from this list yet.
      </p>

      <div className="flex justify-end">
        <Button className="h-11 rounded-xl font-bold">Add item</Button>
      </div>
    </div>
  );
}

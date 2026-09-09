import { Link } from "react-router-dom";
import { ChevronLeft, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { formatCurrency } from "@/lib/utils";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

/** Placeholder — no billing/plan table or payment provider wired up yet. */
export function SettingsBillingView() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Plan & billing" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Plan & billing</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-background/55">
            Current plan
          </span>
          <span className="text-[15px] font-bold text-background">Pro</span>
        </div>
        <div className="flex items-center justify-between gap-4 bg-card p-5">
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-foreground">
              {formatCurrency(49)}
              <span className="text-sm font-semibold text-muted-foreground">/mo</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Renews Oct 1, 2026</div>
          </div>
          <Button variant="outline" className="h-11 rounded-xl font-bold">
            Change plan
          </Button>
        </div>
      </div>

      <section className="card-surface space-y-4 p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-foreground">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Payment method
        </h2>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Visa ending in 4242</div>
          <Button variant="outline" className="h-9 rounded-lg text-xs font-bold">
            Update
          </Button>
        </div>
        <div className="space-y-1.5">
          <div className={FIELD_LABEL}>Billing email</div>
          <Input defaultValue="billing@rossihardscape.com" className={FIELD_INPUT} />
        </div>
      </section>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/common/BackLink";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

const PAYMENT_METHODS = [
  { id: "card", label: "Credit / debit card", enabled: true },
  { id: "ach", label: "ACH / bank transfer", enabled: true },
  { id: "check", label: "Check", enabled: true },
  { id: "cash", label: "Cash", enabled: false },
] as const;

/** Placeholder — no backend support yet for invoicing/payment settings. */
export function SettingsInvoicingView() {
  const [prefix, setPrefix] = useState("INV-");

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Invoicing & payments" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Invoicing & payments</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Receipt className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Applied to every new invoice</span>
        </div>

        <div className="grid grid-cols-1 gap-4 bg-card p-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Payment due</div>
            <div className="relative">
              <Input type="number" min="0" defaultValue={30} className={cn(FIELD_INPUT, "pr-12")} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                days
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Late fee</div>
            <div className="relative">
              <Input type="number" min="0" step="0.1" defaultValue={1.5} className={cn(FIELD_INPUT, "pr-12")} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %/mo
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Invoice number prefix</div>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className={FIELD_INPUT} />
          </div>
        </div>
      </div>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Accepted payment methods</h2>
        <div className="mt-2 divide-y divide-hairline">
          {PAYMENT_METHODS.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 py-3.5">
              <div className="text-sm font-semibold text-foreground">{m.label}</div>
              <Switch defaultChecked={m.enabled} />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button className="h-11 rounded-xl font-bold">Save changes</Button>
      </div>
    </div>
  );
}


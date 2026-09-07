import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DEMO_AUTOMATIONS, DEMO_CREWS, DEMO_QUOTE_DEFAULTS } from "@/lib/demoData";

const SECTIONS = [
  "Business profile",
  "Quote defaults",
  "Invoicing & payments",
  "Pricebook & materials",
  "Team & crews",
  "Notifications",
  "Plan & billing",
] as const;

const QD = DEMO_QUOTE_DEFAULTS;
const DEFAULT_FIELDS = [
  { label: "Deposit required", value: `${QD.depositPct}%`, note: "Collected before mobilization" },
  { label: "Material markup", value: `${QD.materialMarkupPct}%`, note: "On pricebook cost" },
  { label: "Crew labor rate", value: `$${QD.laborRate} / hr`, note: "Loaded rate, 3-man crew" },
  { label: "Quote validity", value: `${QD.quoteValidityDays} days`, note: "Auto-expires after" },
  { label: "Sales tax", value: `${QD.salesTaxPct}%`, note: "MA — materials only" },
  { label: "Waste factor", value: `${QD.wasteFactorPct}%`, note: "Added to paver quantities" },
];

export function SettingsView() {
  const { session } = useAuth();

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader title="Settings" subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews`} />
      <PageHeader
        title="Settings"
        subtitle={`Rossi Hardscape · ${DEMO_CREWS.length} crews · pricebook updated Aug 30`}
      />

      <div className="grid gap-5 md:grid-cols-[240px_1fr] md:items-start">
        {/* Section nav */}
        <nav className="card-surface hidden p-2 md:block">
          {SECTIONS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "rounded-[0.625rem] px-3 py-2.5 text-sm font-semibold",
                i === 1 ? "bg-primary/10 text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </div>
          ))}
        </nav>
        {/* Mobile: section list */}
        <div className="card-surface divide-y divide-hairline md:hidden">
          {SECTIONS.map((s) => (
            <div key={s} className="flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-foreground">
              {s}
              <ChevronRight className="h-4 w-4 text-muted-subtle" />
            </div>
          ))}
        </div>

        <div className="space-y-5">
          {/* Quote defaults */}
          <section className="card-surface p-5 md:p-6">
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">Quote defaults</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Applied to every new quote. You can override per job.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {DEFAULT_FIELDS.map((f) => (
                <div key={f.label}>
                  <div className="text-xs font-semibold text-muted-foreground">{f.label}</div>
                  <div className="mt-1.5 flex h-10 items-center rounded-[0.625rem] border border-border bg-card px-3 text-sm font-semibold text-foreground">
                    {f.value}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-subtle">{f.note}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground">Terms shown on every quote</div>
              <Textarea className="mt-1.5" defaultValue={QD.terms} rows={3} />
            </div>
            <div className="mt-4 flex gap-2.5">
              <Button className="font-bold">Save defaults</Button>
              <Button variant="outline">Revert</Button>
            </div>
          </section>

          {/* Automations */}
          <section className="card-surface p-5 md:p-6">
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">Automations</h2>
            <div className="mt-2 divide-y divide-hairline">
              {DEMO_AUTOMATIONS.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{a.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.description}</div>
                  </div>
                  <Switch defaultChecked={a.enabled} />
                </div>
              ))}
            </div>
          </section>

          {/* Business + account (real-ish: account email is live) */}
          <section className="card-surface p-5 md:p-6">
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">Business profile</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field id="companyName" label="Company name" defaultValue="Rossi Hardscape LLC" />
              <Field id="phone" label="Phone" defaultValue="(413) 555-0100" />
              <Field id="email" label="Business email" defaultValue="billing@rossihardscape.com" />
              <Field id="license" label="License #" defaultValue="MA HIC #187204" />
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" defaultValue="128 Pine St, Northampton MA 01060" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="accountEmail">Account email</Label>
                <Input id="accountEmail" value={session?.user.email ?? ""} readOnly disabled />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button className="font-bold">Save changes</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, defaultValue }: { id: string; label: string; defaultValue: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} defaultValue={defaultValue} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DEMO_AUTOMATIONS, DEMO_CREWS } from "@/lib/demoData";
import { getQuoteDefaults, saveQuoteDefaults, QUOTE_DEFAULTS_FALLBACK, type QuoteDefaults } from "@/lib/api";

const SECTIONS = [
  "Business profile",
  "Quote defaults",
  "Invoicing & payments",
  "Pricebook & materials",
  "Team & crews",
  "Notifications",
  "Plan & billing",
] as const;

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
          <QuoteDefaultsSection />

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

// ---------------------------------------------------------------------------
// Quote defaults — the only real, persisted section of Settings today. Backed
// by the quote_defaults table (one row per user); createQuote() reads it to
// pre-fill deposit % and terms on every new quote, and the Quote Builder
// reads sales tax % / quote validity days straight from it.
// ---------------------------------------------------------------------------

function QuoteDefaultsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["quote-defaults"], queryFn: getQuoteDefaults });

  const seed = (): QuoteDefaults => data ?? QUOTE_DEFAULTS_FALLBACK;
  const [draft, setDraft] = useState<QuoteDefaults>(seed);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const edit = (patch: Partial<QuoteDefaults>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const revert = () => {
    dirty.current = false;
    setDraft(seed());
  };

  const saveMut = useMutation({
    mutationFn: () => saveQuoteDefaults(draft),
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["quote-defaults"] });
      toast({ title: "Quote defaults saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5 md:p-6">
      <h2 className="text-[17px] font-bold tracking-tight text-foreground">Quote defaults</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Applied to every new quote. You can override per job.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NumberField
          label="Deposit required"
          suffix="%"
          value={draft.deposit_pct}
          onChange={(v) => edit({ deposit_pct: v })}
          note="Collected before mobilization"
        />
        <NumberField
          label="Quote validity"
          suffix="days"
          value={draft.quote_validity_days}
          onChange={(v) => edit({ quote_validity_days: v })}
          note="Auto-expires after"
        />
        <NumberField
          label="Sales tax"
          suffix="%"
          step="0.01"
          value={draft.sales_tax_pct}
          onChange={(v) => edit({ sales_tax_pct: v })}
          note="MA — materials only"
        />
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold text-muted-foreground">Terms shown on every quote</div>
        <Textarea
          className="mt-1.5"
          value={draft.terms ?? ""}
          onChange={(e) => edit({ terms: e.target.value })}
          rows={3}
        />
      </div>
      <div className="mt-4 flex gap-2.5">
        <Button
          className="font-bold"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || isLoading}
        >
          {saveMut.isPending ? "Saving…" : "Save defaults"}
        </Button>
        <Button variant="outline" onClick={revert} disabled={saveMut.isPending}>
          Revert
        </Button>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  note,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note: string;
  suffix: string;
  step?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="relative mt-1.5">
        <Input
          type="number"
          step={step ?? "1"}
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-10 pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-subtle">{note}</div>
    </div>
  );
}

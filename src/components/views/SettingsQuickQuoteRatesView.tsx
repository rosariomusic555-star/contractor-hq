import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, DollarSign } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { listQuickQuoteRates, saveQuickQuoteRate, resetQuickQuoteRate } from "@/lib/api";
import { QUICK_QUOTE_TEMPLATES, resolveQuickQuoteRate } from "@/lib/quickQuote";
import { BackLink } from "@/components/common/BackLink";

interface DraftRate {
  value: string;
  hasOverride: boolean;
}

/**
 * Every build type ships a standard starting rate so Quick Quote works
 * with zero setup — this page lets a contractor override theirs per
 * build type. Separate data from Smart Section's templates/calculator
 * numbers (Settings > Manage Smart Section Templates) even though the two
 * share the same 5 build types.
 */
export function SettingsQuickQuoteRatesView() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rates = [] } = useQuery({ queryKey: ["quick-quote-rates"], queryFn: listQuickQuoteRates });

  const seed = (): Record<string, DraftRate> => {
    const out: Record<string, DraftRate> = {};
    for (const t of QUICK_QUOTE_TEMPLATES) {
      const override = rates.find((r) => r.build_type === t.id);
      out[t.id] = { value: String(resolveQuickQuoteRate(t, rates)), hasOverride: !!override };
    }
    return out;
  };

  const [draft, setDraft] = useState<Record<string, DraftRate>>(seed);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const setValue = (buildTypeId: string, value: string) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, [buildTypeId]: { value, hasOverride: true } }));
  };
  const resetRow = (buildTypeId: string, defaultRate: number) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, [buildTypeId]: { value: String(defaultRate), hasOverride: false } }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const t of QUICK_QUOTE_TEMPLATES) {
        const row = draft[t.id];
        if (row.hasOverride) await saveQuickQuoteRate(t.id, parseFloat(row.value) || 0);
        else await resetQuickQuoteRate(t.id);
      }
    },
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["quick-quote-rates"] });
      toast({ title: "Quick Quote rates saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Leaving with unsaved edits asks first (same guard as every builder).
  useUnsavedChangesGuard(
    dirty.current,
    () => saveMut.mutate(),
    () => {
      dirty.current = false;
      setDraft(seed());
    },
    saveMut.isPending,
  );

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-24">
      <MobilePageHeader title="Quick Quote Rates" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Quick Quote Rates</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <DollarSign className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Default rates</span>
        </div>

        <div className="divide-y divide-hairline bg-card p-5">
          {QUICK_QUOTE_TEMPLATES.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.pricingUnit}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative w-28">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={draft[t.id]?.value ?? String(t.defaultRate)}
                    onChange={(e) => setValue(t.id, e.target.value)}
                    className="h-9 pl-6 text-right"
                  />
                </div>
                {draft[t.id]?.hasOverride && (
                  <button
                    type="button"
                    onClick={() => resetRow(t.id, t.defaultRate)}
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Quick Quote uses these to price its single lump-sum line item (rate × quantity) — you can still
        override the rate for any individual quote when you use it.
      </p>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="h-11 rounded-xl font-bold"
        >
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

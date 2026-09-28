import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { getQuoteDefaults, saveQuoteDefaults, QUOTE_DEFAULTS_FALLBACK, type QuoteDefaults } from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

/**
 * The only real, persisted section of Settings — backed by the
 * `quote_defaults` table (one row per user); `createQuote()` reads it to
 * pre-fill deposit % and terms on every new quote, and the Quote Builder
 * reads sales tax % / quote validity days straight from it.
 */
export function SettingsQuoteDefaultsView() {
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
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Quote defaults" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Quote defaults</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <FileText className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Applied to every new quote</span>
        </div>

        <div className="space-y-5 bg-card p-5">
          <p className="text-sm text-muted-foreground">You can override any of these per job.</p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
              note="Sets the quote's “valid until” date"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground">Terms shown on every quote</div>
            <Textarea
              className="mt-1.5"
              value={draft.terms ?? ""}
              onChange={(e) => edit({ terms: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2.5">
        <Button variant="outline" onClick={revert} disabled={saveMut.isPending} className="h-11 rounded-xl">
          Revert
        </Button>
        <Button
          className="h-11 rounded-xl font-bold"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || isLoading}
        >
          {saveMut.isPending ? "Saving…" : "Save defaults"}
        </Button>
      </div>
    </div>
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

import { useEstimatingContext } from "@/hooks/use-estimating-context";
import { averageMetric, findSimilarJobs, similarSampleText } from "@/lib/similarJobs";
import { SimilarJobsHint } from "@/components/planned-actual/SimilarJobsHint";
import { useEffect, useState } from "react";
import { ChevronLeft, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { generateQuoteLineDescription } from "@/lib/assistant";
import type { ProductCatalogItem, QuickQuoteRate } from "@/lib/api";
import {
  resolveQuickQuoteRate,
  type QuickQuoteTemplate,
  type QuickQuoteQuestion,
  type QuickQuoteAnswers,
} from "@/lib/quickQuote";
import { CatalogPicker } from "@/components/materials/CatalogPicker";
import { MeasurementPrefillPicker } from "@/components/measurements/MeasurementPrefillPicker";
import { useMeasurementPrefill } from "@/hooks/use-measurement-prefill";
import { quickQuotePrefill } from "@/lib/measurements";
import { MOBILE_BOTTOM_SHEET } from "@/lib/dialogStyles";

/** How long to wait on the AI before falling back to a templated
 * description — the flow must never get stuck waiting indefinitely. */
const AI_TIMEOUT_MS = 12000;

export interface QuickQuoteResult {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  /** Unit price (rate) — QuoteItem.price is multiplied by quantity
   * downstream, so this must be the per-unit rate, never the pre-computed
   * total. */
  rate: number;
}

export function QuickQuoteFormDialog({
  open,
  onOpenChange,
  template,
  rates,
  catalogItems,
  onCreate,
  projectId,
  featureId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: QuickQuoteTemplate;
  rates: QuickQuoteRate[];
  catalogItems: ProductCatalogItem[];
  onCreate: (result: QuickQuoteResult) => void;
  /** The quote's project — its site measurements prefill the size question
   * (src/lib/measurements.ts quickQuotePrefill). */
  projectId?: string | null;
  /** The section's feature — its own measurement prefills (not all of this type combined). */
  featureId?: string | null;
}) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [answers, setAnswers] = useState<QuickQuoteAnswers>({});
  const [rateStr, setRateStr] = useState("0");
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [descLoading, setDescLoading] = useState(false);
  const [descIsFallback, setDescIsFallback] = useState(false);
  const prefill = useMeasurementPrefill(projectId, template.id, open, featureId);
  // Bumped on every prefill so AreaField re-syncs its own sq ft input.
  const [areaPrefillV, setAreaPrefillV] = useState(0);
  const applyPrefill = (totals: Parameters<typeof quickQuotePrefill>[1] | undefined) => {
    if (!totals) return {};
    setAreaPrefillV((v) => v + 1);
    return quickQuotePrefill(template.id, totals);
  };

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setAnswers(applyPrefill(prefill.selected?.totals));
    setRateStr(String(resolveQuickQuoteRate(template, rates)));
    setPickerFor(null);
    setDescription("");
    setDescIsFallback(false);
    // Re-runs once the project's measurements arrive (sourcesKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template.id, prefill.sourcesKey]);

  const setAnswer = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));

  const rate = parseFloat(rateStr) || 0;
  const quantity = template.quantity(answers);
  const price = rate * quantity;

  const answersAsStrings = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const q of template.questions) {
      const value = answers[q.key];
      if (value == null) continue;
      if (q.type === "catalog_product") {
        const product = value as ProductCatalogItem;
        out[q.label] = `${product.manufacturer} ${product.name}`;
      } else if (q.type === "area") {
        out[q.label] = `${value} sq ft`;
      } else {
        out[q.label] = `${value} ${(q as { unit: string }).unit}`;
      }
    }
    return out;
  };

  const runDescription = async () => {
    setDescLoading(true);
    setDescIsFallback(false);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), AI_TIMEOUT_MS),
    );
    try {
      const result = await Promise.race([
        generateQuoteLineDescription({ buildTypeLabel: template.label, answers: answersAsStrings() }),
        timeout,
      ]);
      setDescription(result);
    } catch (err) {
      void err; // AI unavailable or slow — fall back silently, still usable.
      setDescription(template.fallbackDescription(answers));
      setDescIsFallback(true);
    } finally {
      setDescLoading(false);
    }
  };

  const handleContinue = () => {
    setStep("preview");
    void runDescription();
  };

  const handleCreate = () => {
    onCreate({
      name: template.label,
      description,
      quantity,
      unit: template.lineItemUnit,
      rate,
    });
    onOpenChange(false);
  };

  const pickerQuestion = pickerFor
    ? (template.questions.find((q) => q.key === pickerFor) as { label: string; category?: string } | undefined)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("flex max-h-[85vh] max-w-lg flex-col gap-4", MOBILE_BOTTOM_SHEET)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {template.label} — Quick Quote
            </DialogTitle>
          </DialogHeader>

          {step === "form" ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <MeasurementPrefillPicker
                sources={prefill.sources}
                selected={prefill.selected}
                onSelect={(id) => {
                  prefill.select(id);
                  const totals = prefill.sources.find((s) => s.id === id)?.totals;
                  setAnswers((a) => ({ ...a, ...applyPrefill(totals) }));
                }}
              />
              {template.questions.map((q) => (
                <QuestionField
                  key={q.key}
                  question={q}
                  value={answers[q.key]}
                  onChange={(v) => setAnswer(q.key, v)}
                  onPickCatalog={() => setPickerFor(q.key)}
                  areaPrefillV={areaPrefillV}
                />
              ))}

              <div className="space-y-1.5">
                <Label>Rate ({template.pricingUnit})</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                />
              </div>

              <QuickQuoteInsight buildType={template.id} label={template.label} quantity={quantity} unit={template.lineItemUnit} rate={rate} projectId={projectId ?? null} />

              <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground">
                {quantity.toLocaleString()} {template.lineItemUnit} × {formatCurrency(rate)} ={" "}
                <span className="font-extrabold text-success">{formatCurrency(price)}</span>
              </div>

              <Button onClick={handleContinue} className="h-11 w-full font-bold">
                Continue
              </Button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>

              <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground">
                {quantity.toLocaleString()} {template.lineItemUnit} × {formatCurrency(rate)} ={" "}
                <span className="font-extrabold text-success">{formatCurrency(price)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <button
                    type="button"
                    onClick={() => void runDescription()}
                    disabled={descLoading}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3 w-3", descLoading && "animate-spin")} />
                    Regenerate description
                  </button>
                </div>
                <Textarea
                  value={descLoading ? "" : description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descLoading ? "Writing a description…" : ""}
                  disabled={descLoading}
                  rows={4}
                />
                {descIsFallback && !descLoading && (
                  <p className="text-[11px] text-muted-subtle">
                    AI description unavailable right now — used a quick template instead. Feel free to edit it.
                  </p>
                )}
              </div>

              <Button onClick={handleCreate} disabled={descLoading} className="h-11 w-full font-bold">
                Add to quote
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pickerFor} onOpenChange={(o) => !o && setPickerFor(null)}>
        <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{pickerQuestion?.label ?? "Pick a product"}</DialogTitle>
          </DialogHeader>
          <CatalogPicker
            catalogItems={catalogItems}
            category={pickerQuestion?.category}
            onSelect={(product) => {
              if (pickerFor) setAnswer(pickerFor, product);
              setPickerFor(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  onPickCatalog,
  areaPrefillV,
}: {
  question: QuickQuoteQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  onPickCatalog: () => void;
  areaPrefillV: number;
}) {
  switch (question.type) {
    case "area":
      return <AreaField label={question.label} value={value as number | undefined} onChange={onChange} prefillV={areaPrefillV} />;

    case "number":
      return (
        <div className="space-y-1.5">
          <Label>{question.label}</Label>
          <div className="relative">
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
              className="pr-14"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {question.unit}
            </span>
          </div>
        </div>
      );

    case "catalog_product": {
      const product = value as ProductCatalogItem | null;
      return (
        <div className="space-y-1.5">
          <Label>{question.label}</Label>
          <button
            type="button"
            onClick={onPickCatalog}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <span className={cn("truncate", product ? "font-medium text-foreground" : "text-muted-foreground")}>
              {product ? product.name : "Pick from Catalog…"}
            </span>
            <span className="shrink-0 text-xs font-bold text-primary">{product ? "Change" : "Pick"}</span>
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}

function AreaField({
  label,
  value,
  onChange,
  prefillV,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  /** Bumped when the parent prefilled `value` from site measurements —
   * switches back to the Square footage input to show it. */
  prefillV: number;
}) {
  // Controlled by `value` (the answer) — the sq ft text only mirrors it,
  // kept locally so "12." can be typed. Changes are reported only from the
  // user's own edits, never from a mount/sync effect (an effect reporting
  // "0" on mount used to race the measurements prefill and wipe it).
  const [mode, setMode] = useState<"sqft" | "dimensions">("sqft");
  const [sqft, setSqft] = useState(value ? String(value) : "");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");

  // Follow outside changes (prefill, re-open) without clobbering typing.
  useEffect(() => {
    if (mode === "sqft" && (parseFloat(sqft) || 0) !== (value ?? 0)) setSqft(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    if (prefillV) setMode("sqft");
  }, [prefillV]);

  const dimsArea = (l: string, w: string) => (parseFloat(l) || 0) * (parseFloat(w) || 0);
  const switchMode = (next: "sqft" | "dimensions") => {
    setMode(next);
    onChange(next === "sqft" ? parseFloat(sqft) || 0 : dimsArea(length, width));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => switchMode("sqft")}
          className={cn(
            "rounded-full px-3 py-1 font-semibold transition-colors",
            mode === "sqft" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          Square footage
        </button>
        <button
          type="button"
          onClick={() => switchMode("dimensions")}
          className={cn(
            "rounded-full px-3 py-1 font-semibold transition-colors",
            mode === "dimensions" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          Length × width
        </button>
      </div>

      {mode === "sqft" ? (
        <Input
          type="number"
          inputMode="decimal"
          placeholder="e.g. 300"
          value={sqft}
          onChange={(e) => {
            setSqft(e.target.value);
            onChange(parseFloat(e.target.value) || 0);
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Length (ft)"
            value={length}
            onChange={(e) => {
              setLength(e.target.value);
              onChange(dimsArea(e.target.value, width));
            }}
          />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Width (ft)"
            value={width}
            onChange={(e) => {
              setWidth(e.target.value);
              onChange(dimsArea(length, e.target.value));
            }}
          />
        </div>
      )}

      {!!value && value > 0 && (
        <p className="text-xs font-medium text-primary">= {Math.round(value).toLocaleString()} sq ft</p>
      )}
    </div>
  );
}

/** Under the rate: what similar completed jobs actually cost to build and
 * sold for per unit (Feature 5) — a reference for the rate, never applied. */
function QuickQuoteInsight({
  buildType,
  label,
  quantity,
  unit,
  rate,
  projectId,
}: {
  buildType: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  projectId: string | null;
}) {
  const ec = useEstimatingContext(projectId);
  const sizeUnit = unit === "sf" ? "sq ft" : unit === "lf" ? "LF" : unit;
  const res = findSimilarJobs(ec.closeouts, {
    build_type: buildType,
    size: quantity > 0 ? quantity : null,
    size_unit: sizeUnit,
    context: ec.context,
    excludeProjectId: projectId,
  });
  const cost = averageMetric(res.matches, (f) => (f.size_unit === sizeUnit ? f.units.cost_per_unit : null));
  const price = averageMetric(res.matches, (f) => (f.size_unit === sizeUnit ? f.units.price_per_unit : null));
  if (cost.n === 0 || cost.avg == null) return null;
  const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);
  const text = `${similarSampleText(res, cost.n, label)} ${cost.isAverage ? "averaged" : "cost"} ${money(cost.avg)}/${sizeUnit} to build${
    price.avg != null ? `, sold at ${money(price.avg)}/${sizeUnit}` : ""
  }${rate > 0 ? ` (your rate ${money(rate)})` : ""}${cost.isAverage ? "." : " — reference only."}`;
  return (
    <SimilarJobsHint
      hintKey={`qq:${projectId}:${buildType}`}
      text={text}
      matches={res.matches.filter((m) => m.feature.size_unit === sizeUnit && m.feature.units.cost_per_unit != null)}
      widened={res.widened}
      metric={(m) => `cost ${money(m.feature.units.cost_per_unit!)}${m.feature.units.price_per_unit != null ? ` · sold ${money(m.feature.units.price_per_unit)}` : ""}/${sizeUnit}`}
    />
  );
}

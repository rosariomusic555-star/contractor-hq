import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listSmartSectionSettings, type ProductCatalogItem } from "@/lib/api";
import {
  findSmartSectionSettings,
  resolveEffectiveLineItems,
  resolveTunableValue,
  type SmartSectionTemplate,
  type SmartSectionQuestion,
  type SmartSectionAnswers,
  type CalculatedLine,
  type AreaAndPerimeter,
  type CatalogProductQuestion,
} from "@/lib/smartSections";
import { CatalogPicker } from "./CatalogPicker";
import { MeasurementPrefillPicker } from "@/components/measurements/MeasurementPrefillPicker";
import { useMeasurementPrefill } from "@/hooks/use-measurement-prefill";
import { smartSectionPrefill, type FeatureTotals } from "@/lib/measurements";
import { useEstimatingContext } from "@/hooks/use-estimating-context";
import { averageMetric, findSimilarJobs, similarSampleText } from "@/lib/similarJobs";
import { SimilarJobsHint } from "@/components/planned-actual/SimilarJobsHint";

/** A prefilled patio size handed to AreaOrDimensionsField; `v` bumps on
 * every (re)apply so the field re-syncs its own inputs. */
type AreaPrefill = { areaSqft: number; perimeterFt: number | null; v: number };

/**
 * Step 2 — the per-section calculator. Fills in quantities on the
 * section's *existing* line items (matched by name against the build
 * type's template) — never renames them, never touches lines the
 * calculator doesn't recognize. Re-running always overwrites, no
 * confirmation needed.
 *
 * Size questions are prefilled from the project's site measurements for
 * this build type (src/lib/measurements.ts smartSectionPrefill) — one
 * instance or all combined, picked in the banner at the top. Everything
 * stays editable before running.
 */
export function SmartSectionCalculatorDialog({
  open,
  onOpenChange,
  template,
  catalogItems,
  onApply,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: SmartSectionTemplate;
  catalogItems: ProductCatalogItem[];
  /** `inputs` = what the calculator was given (0114) — saved on the
   * section for closeouts / similar-job matching. */
  onApply: (lines: CalculatedLine[], inputs: Record<string, unknown>) => void;
  projectId?: string | null;
}) {
  const [answers, setAnswers] = useState<SmartSectionAnswers>({});
  const ec = useEstimatingContext(projectId);
  const [useAdjustments, setUseAdjustments] = useState(true);
  // Conditional adjustments the contractor applied from Estimating
  // insights, for this build type's lines on a job like this one.
  const slotAdjustments = resolveEffectiveLineItems(template, null).flatMap((li) =>
    li.slot_key ? ec.activeAdjustments(template.id, `slot:${li.slot_key}`).map((a) => ({ ...a, slot: li.slot_key! })) : [],
  );
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [areaPrefill, setAreaPrefill] = useState<AreaPrefill | null>(null);
  const prefill = useMeasurementPrefill(projectId, template.id, open);

  /** Measurement totals → answers. Area goes through AreaOrDimensionsField
   * (it owns its sq ft / L×W inputs); plain numbers are set directly. */
  const prefillAnswers = (totals: FeatureTotals | undefined): SmartSectionAnswers => {
    if (!totals) return {};
    // Height → courses uses this contractor's course height for the template.
    const courseHeightIn = template.tunables.some((t) => t.key === "course_height_in")
      ? resolveTunableValue(template, settings, "course_height_in")
      : undefined;
    const { area, ...rest } = smartSectionPrefill(template.id, totals, { courseHeightIn }) as { area?: Omit<AreaPrefill, "v"> } & SmartSectionAnswers;
    if (area) setAreaPrefill((p) => ({ ...area, v: (p?.v ?? 0) + 1 }));
    return rest;
  };

  const { data: allSettings = [] } = useQuery({
    queryKey: ["smart-section-settings"],
    queryFn: listSmartSectionSettings,
    enabled: open,
  });
  const settings = findSmartSectionSettings(allSettings, template.id);

  useEffect(() => {
    if (!open) return;
    const seeded: SmartSectionAnswers = {};
    const questionKeys = new Set(template.questions.map((q) => q.key));
    for (const q of template.questions) {
      if (q.type === "toggle") seeded[q.key] = q.defaultValue ?? false;
      else if (q.type === "select") seeded[q.key] = q.defaultValue ?? q.options[0]?.value;
      else if (q.type === "number") {
        // Only questions backed by a tunable (e.g. "base depth", "number
        // of courses") get a contractor-customizable seed value — plain
        // per-job dimension questions (linear feet, sq ft…) have no
        // sensible default and stay blank, same as before.
        const hasTunable = template.tunables.some((t) => t.key === q.key);
        seeded[q.key] = hasTunable ? resolveTunableValue(template, settings, q.key) : q.defaultValue;
      } else if (q.type === "catalog_product") seeded[q.key] = null;
    }
    // Tunables with no on-screen question (pure formula constants) are
    // seeded invisibly so calculate() can read them uniformly.
    for (const t of template.tunables) {
      if (!questionKeys.has(t.key)) seeded[t.key] = resolveTunableValue(template, settings, t.key);
    }
    setAreaPrefill(null); // nothing stale from a previous open
    setAnswers({ ...seeded, ...prefillAnswers(prefill.selected?.totals) });
    setPickerFor(null);
    // Re-seeds once the settings query resolves too — on a fresh page
    // load this dialog can mount before listSmartSectionSettings
    // returns, and without allSettings here the seeded values would stay
    // stuck on app defaults even after the contractor's real
    // customization arrives.
    // Also re-seeds once the project's measurements arrive (sourcesKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, allSettings, prefill.sourcesKey]);

  const setAnswer = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));

  const visibleQuestions = template.questions.filter(
    (q) => !("showWhen" in q) || !q.showWhen || answers[q.showWhen.key] === q.showWhen.equals,
  );

  const handleApply = () => {
    const effectiveLineItems = resolveEffectiveLineItems(template, settings);
    const lines: CalculatedLine[] = [];
    for (const raw of template.calculate(answers)) {
      const lineItem = effectiveLineItems.find((li) => li.slot_key === raw.slotKey);
      if (!lineItem) continue; // slot removed from this contractor's template — nothing to fill in
      const factor = useAdjustments
        ? slotAdjustments.filter((a) => a.slot === raw.slotKey).reduce((f, a) => f * Number(a.factor), 1)
        : 1;
      const qty = factor === 1 ? raw.quantity : /ton/i.test(raw.unit) ? Math.ceil(raw.quantity * factor * 2) / 2 : Math.round(raw.quantity * factor * 100) / 100;
      lines.push({
        name: lineItem.name,
        quantity: qty,
        unit: raw.unit,
        catalogProduct: raw.catalogProduct,
      });
    }
    const inputs: Record<string, unknown> = { calculated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(answers)) {
      if (v == null) continue;
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") inputs[k] = v;
      else if (typeof v === "object" && "areaSqft" in (v as object)) inputs[k] = { areaSqft: (v as AreaAndPerimeter).areaSqft, perimeterFt: (v as AreaAndPerimeter).perimeterFt ?? null };
      else if (typeof v === "object" && "id" in (v as object)) inputs[k] = (v as ProductCatalogItem).id;
    }
    if (useAdjustments && slotAdjustments.length) inputs.adjustments = slotAdjustments.map((a) => ({ id: a.id, label: a.label, factor: a.factor }));
    onApply(lines, inputs);
    onOpenChange(false);
  };

  const pickerQuestion = pickerFor
    ? (template.questions.find((q) => q.key === pickerFor) as CatalogProductQuestion | undefined)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              {template.label} calculator
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Fills in quantities on this section's existing line items. Running this again always
              overwrites them — nothing else on the sheet is touched.
            </p>
            <MeasurementPrefillPicker
              sources={prefill.sources}
              selected={prefill.selected}
              onSelect={(id) => {
                prefill.select(id);
                const totals = prefill.sources.find((s) => s.id === id)?.totals;
                setAnswers((a) => ({ ...a, ...prefillAnswers(totals) }));
              }}
            />
            {visibleQuestions.map((q) => (
              <div key={q.key} className="space-y-1.5">
                <QuestionField
                  question={q}
                  value={answers[q.key]}
                  onChange={(v) => setAnswer(q.key, v)}
                  onPickCatalog={() => setPickerFor(q.key)}
                  areaPrefill={areaPrefill}
                />
                {q.key === "base_depth_in" && <BaseInsight template={template} answers={answers} ec={ec} projectId={projectId ?? null} />}
              </div>
            ))}
          </div>

          {slotAdjustments.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <Checkbox checked={useAdjustments} onCheckedChange={(v) => setUseAdjustments(!!v)} className="mt-0.5" />
              <span>
                <span className="font-semibold text-foreground">Use your adjustments for this job</span>
                <span className="block text-muted-foreground">
                  {slotAdjustments.map((a) => `${a.label} (×${Number(a.factor)})`).join(" · ")} — from Estimating insights, because this job matches.
                </span>
              </span>
            </label>
          )}

          <Button onClick={handleApply} className="h-11 w-full font-bold">
            Calculate quantities
          </Button>
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
  areaPrefill,
}: {
  question: SmartSectionQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  onPickCatalog: () => void;
  areaPrefill: AreaPrefill | null;
}) {
  switch (question.type) {
    case "area_or_dimensions":
      return (
        <AreaOrDimensionsField
          label={question.label}
          value={value as AreaAndPerimeter | undefined}
          onChange={onChange}
          prefill={areaPrefill}
        />
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label>{question.label}</Label>
          <div className="relative">
            <Input
              type="number"
              step={question.step ?? "any"}
              inputMode="decimal"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
              className="pr-16"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {question.unit}
            </span>
          </div>
        </div>
      );

    case "toggle":
      return (
        <label className="flex items-center gap-2">
          <Checkbox checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
          <span className="text-sm font-medium text-foreground">{question.label}</span>
        </label>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label>{question.label}</Label>
          <Select value={(value as string) ?? question.options[0]?.value} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {question.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

function AreaOrDimensionsField({
  label,
  value,
  onChange,
  prefill,
}: {
  label: string;
  value: AreaAndPerimeter | undefined;
  onChange: (v: AreaAndPerimeter) => void;
  /** From site measurements — fills the sq ft input, and carries the real
   * perimeter when the measured shape has one. */
  prefill: AreaPrefill | null;
}) {
  const [mode, setMode] = useState<"sqft" | "dimensions">("sqft");
  const [sqft, setSqft] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  // The measured perimeter for the prefilled sq ft; dropped as soon as the
  // sq ft is edited (it no longer describes the same shape).
  const [knownPerimeter, setKnownPerimeter] = useState<number | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setMode("sqft");
    setSqft(String(prefill.areaSqft));
    setKnownPerimeter(prefill.perimeterFt);
  }, [prefill?.v]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === "sqft") {
      const area = parseFloat(sqft) || 0;
      // ASSUMPTION: perimeter estimated assuming a square footprint when
      // only sq ft is known — real perimeter needs actual dimensions.
      onChange({ areaSqft: area, perimeterFt: knownPerimeter ?? 4 * Math.sqrt(area) });
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      onChange({ areaSqft: l * w, perimeterFt: 2 * (l + w) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sqft, length, width, knownPerimeter]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("sqft")}
          className={cn(
            "rounded-full px-3 py-1 font-semibold transition-colors",
            mode === "sqft" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          Square footage
        </button>
        <button
          type="button"
          onClick={() => setMode("dimensions")}
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
            setKnownPerimeter(null);
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Length (ft)"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Width (ft)"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </div>
      )}

      {value && value.areaSqft > 0 && (
        <p className="text-xs font-medium text-primary">
          = {Math.round(value.areaSqft).toLocaleString()} sq ft · perimeter ≈{" "}
          {Math.round(value.perimeterFt).toLocaleString()} ft
          {mode === "sqft" && (knownPerimeter ? " (from site measurements)" : " (estimated, assumes a square footprint)")}
        </p>
      )}
    </div>
  );
}

/** Under "Base depth": how much base similar completed jobs actually used
 * per sq ft, vs what this contractor's default depth/coverage plans. */
function BaseInsight({
  template,
  answers,
  ec,
  projectId,
}: {
  template: SmartSectionTemplate;
  answers: SmartSectionAnswers;
  ec: ReturnType<typeof useEstimatingContext>;
  projectId: string | null;
}) {
  const area = (answers.area as AreaAndPerimeter | undefined)?.areaSqft || null;
  const depth = Number(answers.base_depth_in) || null;
  const coverage = Number(answers.base_coverage_sqft_per_ton) || null;
  const family = (Object.values(answers).find((v) => v && typeof v === "object" && "manufacturer" in (v as object)) as ProductCatalogItem | undefined)?.manufacturer ?? null;
  const res = findSimilarJobs(ec.closeouts, {
    build_type: template.id,
    size: area,
    size_unit: "sq ft",
    context: ec.context,
    base_depth_in: depth,
    material_family: family,
    excludeProjectId: projectId,
  });
  const m = averageMetric(res.matches, (f) => f.units.base_tons_per_sqft);
  if (m.n === 0 || m.avg == null) return null;
  const mine = depth && coverage ? depth / coverage : null;
  const avg = Math.round(m.avg * 1000) / 1000;
  const text = `${similarSampleText(res, m.n, template.label)} ${m.isAverage ? "averaged" : "used"} ${avg} tons base/sq ft${
    mine ? ` vs your default ${Math.round(mine * 1000) / 1000}` : ""
  }${m.isAverage ? "." : " — reference only."}`;
  return (
    <SimilarJobsHint
      hintKey={`base:${projectId}:${template.id}`}
      text={text}
      matches={res.matches.filter((x) => x.feature.units.base_tons_per_sqft != null)}
      widened={res.widened}
      metric={(x) => `${x.feature.units.base_tons_per_sqft} t/sq ft${x.feature.base_depth_in ? ` · ${x.feature.base_depth_in}" base` : ""}`}
    />
  );
}

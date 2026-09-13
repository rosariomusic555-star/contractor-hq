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

/**
 * Step 2 — the per-section calculator. Fills in quantities on the
 * section's *existing* line items (matched by name against the build
 * type's template) — never renames them, never touches lines the
 * calculator doesn't recognize. Re-running always overwrites, no
 * confirmation needed.
 */
export function SmartSectionCalculatorDialog({
  open,
  onOpenChange,
  template,
  catalogItems,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: SmartSectionTemplate;
  catalogItems: ProductCatalogItem[];
  onApply: (lines: CalculatedLine[]) => void;
}) {
  const [answers, setAnswers] = useState<SmartSectionAnswers>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);

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
    setAnswers(seeded);
    setPickerFor(null);
    // Re-seeds once the settings query resolves too — on a fresh page
    // load this dialog can mount before listSmartSectionSettings
    // returns, and without allSettings here the seeded values would stay
    // stuck on app defaults even after the contractor's real
    // customization arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, allSettings]);

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
      lines.push({
        name: lineItem.name,
        quantity: raw.quantity,
        unit: raw.unit,
        catalogProduct: raw.catalogProduct,
      });
    }
    onApply(lines);
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
            {visibleQuestions.map((q) => (
              <QuestionField
                key={q.key}
                question={q}
                value={answers[q.key]}
                onChange={(v) => setAnswer(q.key, v)}
                onPickCatalog={() => setPickerFor(q.key)}
              />
            ))}
          </div>

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
}: {
  question: SmartSectionQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  onPickCatalog: () => void;
}) {
  switch (question.type) {
    case "area_or_dimensions":
      return (
        <AreaOrDimensionsField
          label={question.label}
          value={value as AreaAndPerimeter | undefined}
          onChange={onChange}
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
}: {
  label: string;
  value: AreaAndPerimeter | undefined;
  onChange: (v: AreaAndPerimeter) => void;
}) {
  const [mode, setMode] = useState<"sqft" | "dimensions">("sqft");
  const [sqft, setSqft] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");

  useEffect(() => {
    if (mode === "sqft") {
      const area = parseFloat(sqft) || 0;
      // ASSUMPTION: perimeter estimated assuming a square footprint when
      // only sq ft is known — real perimeter needs actual dimensions.
      onChange({ areaSqft: area, perimeterFt: 4 * Math.sqrt(area) });
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      onChange({ areaSqft: l * w, perimeterFt: 2 * (l + w) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sqft, length, width]);

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
          onChange={(e) => setSqft(e.target.value)}
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
          {mode === "sqft" && " (estimated, assumes a square footprint)"}
        </p>
      )}
    </div>
  );
}

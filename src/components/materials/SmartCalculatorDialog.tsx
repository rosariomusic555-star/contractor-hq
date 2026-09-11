import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMaterialDefaults, type PriceBookItem } from "@/lib/api";
import {
  BUILD_TYPES,
  type BuildTypeDefinition,
  type CalculatorInputs,
  type GeneratedMaterialItem,
} from "@/lib/materialsCalculators";

const NONE = "__none__";

export function SmartCalculatorDialog({
  open,
  onOpenChange,
  priceBookItems,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceBookItems: PriceBookItem[];
  onGenerate: (sectionName: string, items: GeneratedMaterialItem[]) => void;
}) {
  const [buildType, setBuildType] = useState<BuildTypeDefinition | null>(null);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({});

  const { data: materialDefaults } = useQuery({
    queryKey: ["material-defaults"],
    queryFn: getMaterialDefaults,
    enabled: open,
  });

  // Reset to the build-type picker every time the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setBuildType(null);
    setDimensionValues({});
    setSlotSelections({});
  }, [open]);

  const chooseBuildType = (bt: BuildTypeDefinition) => {
    setBuildType(bt);
    const seeded: Record<string, string> = {};
    for (const field of bt.dimensionFields) {
      const fromDefaults = field.defaultFrom && materialDefaults ? materialDefaults[field.defaultFrom] : null;
      seeded[field.key] = fromDefaults != null ? String(fromDefaults) : "";
    }
    setDimensionValues(seeded);
    setSlotSelections(Object.fromEntries(bt.materialSlots.map((s) => [s.key, NONE])));
  };

  const canGenerate =
    !!buildType && buildType.materialSlots.every((s) => !s.required || slotSelections[s.key] !== NONE);

  const summary = buildType?.summarizeDimensions
    ? buildType.summarizeDimensions(
        Object.fromEntries(
          buildType.dimensionFields.map((f) => [f.key, parseFloat(dimensionValues[f.key]) || 0]),
        ),
      )
    : null;

  const handleGenerate = () => {
    if (!buildType) return;
    const dimensions: Record<string, number> = {};
    for (const field of buildType.dimensionFields) {
      dimensions[field.key] = parseFloat(dimensionValues[field.key]) || 0;
    }
    const selections: Record<string, PriceBookItem | null> = {};
    for (const slot of buildType.materialSlots) {
      const pickedId = slotSelections[slot.key];
      selections[slot.key] = pickedId && pickedId !== NONE ? priceBookItems.find((p) => p.id === pickedId) ?? null : null;
    }
    const inputs: CalculatorInputs = { dimensions, selections };
    const items = buildType.calculate(inputs);
    onGenerate(buildType.label, items);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {buildType ? buildType.label : "Smart Calculator"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          {!buildType ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Pick a build type — enter its dimensions and we'll generate the material line items for you.
              </p>
              {BUILD_TYPES.map((bt) => (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => chooseBuildType(bt)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{bt.label}</span>
                    <span className="block text-xs text-muted-foreground">{bt.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                </button>
              ))}
              <p className="pt-1 text-xs text-muted-subtle">
                More build types (Retaining Wall, Seating Wall, Outdoor Kitchen, Fire Pit) coming later.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setBuildType(null)}
                className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Choose a different build type
              </button>

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">Dimensions</h3>
                <div className="grid grid-cols-2 gap-3">
                  {buildType.dimensionFields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`dim-${field.key}`}>{field.label}</Label>
                      <div className="relative">
                        <Input
                          id={`dim-${field.key}`}
                          type="number"
                          step={field.step ?? "any"}
                          inputMode="decimal"
                          placeholder={field.placeholder}
                          value={dimensionValues[field.key] ?? ""}
                          onChange={(e) =>
                            setDimensionValues((d) => ({ ...d, [field.key]: e.target.value }))
                          }
                          className="pr-12"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {field.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {summary && <p className="text-xs font-medium text-primary">{summary}</p>}
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">Materials</h3>
                {buildType.materialSlots.map((slot) => {
                  const options = priceBookItems.filter((p) => p.material_type === slot.materialType);
                  return (
                    <div key={slot.key} className="space-y-1.5">
                      <Label htmlFor={`slot-${slot.key}`}>
                        {slot.label}
                        {slot.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Select
                        value={slotSelections[slot.key] ?? NONE}
                        onValueChange={(v) => setSlotSelections((s) => ({ ...s, [slot.key]: v }))}
                      >
                        <SelectTrigger id={`slot-${slot.key}`}>
                          <SelectValue placeholder="No specific product" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No specific product — generic estimate</SelectItem>
                          {options.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {options.length === 0 && (
                        <p className="text-[11px] text-muted-subtle">
                          No Price Book items tagged "{slot.label}" yet — will use a generic estimate.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {buildType && (
          <Button onClick={handleGenerate} disabled={!canGenerate} className="h-11 w-full font-bold">
            Generate materials
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

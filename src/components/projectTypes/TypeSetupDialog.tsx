import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { deleteTypeConfig, listMaterialCategories, saveTypeConfig, type Category } from "@/lib/api";
import { COST_TYPE_LABEL, LINE_COST_TYPES, type LineCostType } from "@/lib/costPlanMath";
import {
  FIELD_KINDS,
  describeFormula,
  emptyTypeConfig,
  isNumericField,
  keyFrom,
  totalOptions,
  type ConfigLine,
  type FieldKind,
  type LineFormula,
  type MeasureField,
  type TypeConfig,
} from "@/lib/typeConfig";
import { PRESET_SOURCES, configFromBuiltIn } from "@/lib/typeConfigPresets";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

const newId = () => crypto.randomUUID();
const SECTION = "space-y-3";
const ROW = "rounded-xl border border-hairline p-3";
const SMALL_LABEL = "text-[11px] font-bold uppercase tracking-wide text-muted-subtle";
const FIXED = "__fixed__";

/** Up/down for a short settings list (a dialog row — no drag here). */
function MoveButtons({ index, length, onMove }: { index: number; length: number; onMove: (to: number) => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)} className="rounded p-1.5 text-muted-subtle hover:bg-muted disabled:opacity-30">
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Move down" disabled={index === length - 1} onClick={() => onMove(index + 1)} className="rounded p-1.5 text-muted-subtle hover:bg-muted disabled:opacity-30">
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Settings › Project types › Set up — a custom type's measurement card,
 * starting Cost plan lines, calculator formulas and Quick Quote rate (0159).
 * Only for types that don't match a built-in type (those keep the app's own
 * card and templates). Saved as one row; nothing changes until Save.
 */
function TypeSetupDialogInner({
  category,
  existing,
  open,
  onOpenChange,
}: {
  category: Category;
  existing: TypeConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: materialCategories = [] } = useQuery({ queryKey: ["material-categories"], queryFn: listMaterialCategories, enabled: open });
  const [draft, setDraft] = useState<TypeConfig>(existing ?? emptyTypeConfig(category.id));
  const [tab, setTab] = useState("measurements");
  useEffect(() => {
    if (open) {
      setDraft(existing ? structuredClone(existing) : emptyTypeConfig(category.id));
      setTab("measurements");
    }
  }, [open, existing, category.id]);
  const set = (patch: Partial<TypeConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const totals = totalOptions(draft);

  const problem = (() => {
    if (draft.fields.some((f) => !f.label.trim())) return "Every measurement needs a name.";
    if (draft.line_items.some((l) => !l.name.trim())) return "Every line item needs a name.";
    if (draft.tunables.some((t) => !t.label.trim())) return "Every default needs a name.";
    if (draft.quick_quote && !totals.some((t) => t.key === draft.quick_quote!.total_key)) return "Pick what Quick Quote prices.";
    return null;
  })();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["type-configs"] });
  };
  const save = useMutation({
    mutationFn: () =>
      saveTypeConfig({
        ...draft,
        // Drop summary picks / formulas pointing at measurements that were removed.
        summary_keys: draft.summary_keys.filter((k) => draft.fields.some((f) => f.key === k)),
        line_items: draft.line_items.map((l) =>
          l.formula && l.formula.total && !totals.some((t) => t.key === l.formula!.total) ? { ...l, formula: null } : l,
        ),
      }),
    onSuccess: () => {
      refresh();
      toast({ title: `Saved the ${category.name} setup` });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => deleteTypeConfig(category.id),
    onSuccess: () => {
      refresh();
      toast({ title: `Removed the ${category.name} setup`, description: "Measurements already entered are kept." });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't remove", description: e.message, variant: "destructive" }),
  });

  // Copying over work already done asks first (inline, below the picker).
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const startFrom = (buildType: string) => {
    const hasWork = draft.fields.length || draft.line_items.length || draft.tunables.length;
    if (hasWork) setPendingPreset(buildType);
    else setDraft(configFromBuiltIn(category.id, buildType));
  };

  // --- fields ---
  const setField = (i: number, patch: Partial<MeasureField>) => set({ fields: draft.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const addField = () => {
    const key = keyFrom("measurement", draft.fields.map((f) => f.key));
    set({ fields: [...draft.fields, { key, kind: "area", label: "" }], summary_keys: [...draft.summary_keys, key] });
  };
  // --- lines ---
  const setLine = (i: number, patch: Partial<ConfigLine>) => set({ line_items: draft.line_items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setFormula = (i: number, patch: Partial<LineFormula> | null) => {
    const l = draft.line_items[i];
    if (patch === null) return setLine(i, { formula: null });
    const base: LineFormula = l.formula ?? { total: totals[0]?.key ?? null, op: "times", factor: 1, round: "up" };
    setLine(i, { formula: { ...base, ...patch } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Set up {category.name}</DialogTitle>
          <DialogDescription>
            Its measurement card, the Cost plan lines it starts with, how the calculator fills them, and its Quick Quote rate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Start from a built-in type:</span>
          <Select value="" onValueChange={startFrom}>
            <SelectTrigger className="h-9 w-56" aria-label="Start from a built-in type">
              <SelectValue placeholder={draft.based_on ? `Based on ${PRESET_SOURCES.find((p) => p.id === draft.based_on)?.label ?? draft.based_on}` : "Pick one (optional)"} />
            </SelectTrigger>
            <SelectContent>
              {PRESET_SOURCES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  Based on {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingPreset && (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <span className="text-foreground">
                Replace this setup with a copy of {PRESET_SOURCES.find((p) => p.id === pendingPreset)?.label}?
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setDraft(configFromBuiltIn(category.id, pendingPreset));
                  setPendingPreset(null);
                }}
              >
                Replace
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingPreset(null)}>
                Keep mine
              </Button>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="lines">Line items</TabsTrigger>
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="qq">Quick Quote</TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto pt-3">
            {/* Measurements */}
            <TabsContent value="measurements" className={cn(SECTION, "mt-0")}>
              {draft.fields.length === 0 && <p className="text-sm text-muted-foreground">No measurements yet — the card only has custom measurements.</p>}
              {draft.fields.map((f, i) => (
                <div key={f.key} className={ROW}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Name, e.g. Bed area" aria-label="Measurement name" className="h-9 min-w-[10rem] flex-1" />
                    <Select value={f.kind} onValueChange={(v) => setField(i, { kind: v as FieldKind, unit: v === "height" ? "in" : undefined })}>
                      <SelectTrigger className="h-9 w-40" aria-label="Kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <MoveButtons index={i} length={draft.fields.length} onMove={(to) => set({ fields: moved(draft.fields, i, to) })} />
                    <button
                      type="button"
                      aria-label={`Remove ${f.label || "measurement"}`}
                      onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i), summary_keys: draft.summary_keys.filter((k) => k !== f.key) })}
                      className="rounded p-1.5 text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{FIELD_KINDS.find((k) => k.value === f.kind)?.hint}</span>
                    {f.kind === "number" && (
                      <Input value={f.unit ?? ""} onChange={(e) => setField(i, { unit: e.target.value })} placeholder="Unit, e.g. tons" aria-label="Unit" className="h-8 w-32" />
                    )}
                    {f.kind === "height" && (
                      <Select value={f.unit === "ft" ? "ft" : "in"} onValueChange={(v) => setField(i, { unit: v })}>
                        <SelectTrigger className="h-8 w-24" aria-label="Height unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">inches</SelectItem>
                          <SelectItem value="ft">feet</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {f.kind === "select" && (
                      <Input
                        value={(f.options ?? []).join(", ")}
                        onChange={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                        placeholder="Options, comma-separated"
                        aria-label="Options"
                        className="h-8 min-w-[14rem] flex-1"
                      />
                    )}
                    {f.kind !== "notes" && (
                      <label className="flex items-center gap-1.5">
                        <Checkbox
                          checked={draft.summary_keys.includes(f.key)}
                          onCheckedChange={(on) =>
                            set({ summary_keys: on ? [...draft.summary_keys, f.key] : draft.summary_keys.filter((k) => k !== f.key) })
                          }
                        />
                        Show in the summary
                      </label>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-1 h-4 w-4" /> Add measurement
              </Button>
            </TabsContent>

            {/* Line items */}
            <TabsContent value="lines" className={cn(SECTION, "mt-0")}>
              <p className="text-xs text-muted-foreground">The lines a new Cost plan section for this type starts with.</p>
              {draft.line_items.map((l, i) => (
                <div key={l.id} className="space-y-1.5 rounded-lg border border-hairline p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="Line name, e.g. Mulch" aria-label="Line name" className="h-9 min-w-[10rem] flex-1" />
                  <Select
                    value={l.cost_type}
                    onValueChange={(v) => setLine(i, v === "material" ? { cost_type: "material" } : { cost_type: v as LineCostType, material_category_id: null })}
                  >
                    <SelectTrigger className="h-9 w-36" aria-label="Line type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_COST_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {COST_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <MoveButtons index={i} length={draft.line_items.length} onMove={(to) => set({ line_items: moved(draft.line_items, i, to) })} />
                  <button
                    type="button"
                    aria-label={`Remove ${l.name || "line"}`}
                    onClick={() => set({ line_items: draft.line_items.filter((_, j) => j !== i) })}
                    className="rounded p-1.5 text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* 0162 — the line's default category (materials) and description. */}
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  {l.cost_type === "material" && (
                    <div className="sm:w-48 sm:shrink-0">
                      <Select
                        value={l.material_category_id && materialCategories.some((c) => c.id === l.material_category_id) ? l.material_category_id : "__none__"}
                        onValueChange={(v) => setLine(i, { material_category_id: v === "__none__" ? null : v })}
                      >
                        <SelectTrigger className="h-9 text-xs" aria-label="Default category">
                          <SelectValue placeholder="Uncategorized" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Uncategorized</SelectItem>
                          {materialCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {l.material_category_id && materialCategories.length > 0 && !materialCategories.some((c) => c.id === l.material_category_id) && (
                        <p className="mt-0.5 text-[11px] font-semibold text-warning-strong">Category was deleted — choose category</p>
                      )}
                    </div>
                  )}
                  <Input
                    value={l.description ?? ""}
                    onChange={(e) => setLine(i, { description: e.target.value || null })}
                    placeholder="Default description (optional)"
                    aria-label="Default description"
                    className="h-9 min-w-0 flex-1 text-xs"
                  />
                </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set({ line_items: [...draft.line_items, { id: newId(), name: "", cost_type: "material", formula: null }] })}>
                <Plus className="mr-1 h-4 w-4" /> Add line item
              </Button>
            </TabsContent>

            {/* Calculator */}
            <TabsContent value="calculator" className={cn(SECTION, "mt-0")}>
              <p className="text-xs text-muted-foreground">
                How "Fill quantities" turns this type's measurements into line quantities. Quantities are exact — waste is still set per line in
                the Cost plan.
              </p>
              {draft.line_items.length === 0 && <p className="text-sm text-muted-foreground">Add line items first.</p>}
              {draft.line_items.map((l, i) => {
                const f = l.formula;
                return (
                  <div key={l.id} className={ROW}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{l.name || "Unnamed line"}</span>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={!!f} onCheckedChange={(on) => setFormula(i, on ? {} : null)} aria-label={`Calculate ${l.name}`} />
                        Calculate
                      </label>
                    </div>
                    {f && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Qty =</span>
                        <Select value={f.total ?? FIXED} onValueChange={(v) => setFormula(i, { total: v === FIXED ? null : v })}>
                          <SelectTrigger className="h-9 w-40" aria-label="Based on">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {totals.map((t) => (
                              <SelectItem key={t.key} value={t.key}>
                                {t.label} ({t.unit || "#"})
                              </SelectItem>
                            ))}
                            <SelectItem value={FIXED}>A fixed number</SelectItem>
                          </SelectContent>
                        </Select>
                        {f.total != null && (
                          <Select value={f.op} onValueChange={(v) => setFormula(i, { op: v as "times" | "per" })}>
                            <SelectTrigger className="h-9 w-20" aria-label="Operation">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="times">×</SelectItem>
                              <SelectItem value="per">÷</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Select
                          value={typeof f.factor === "number" ? "__number__" : f.factor.tunable}
                          onValueChange={(v) => setFormula(i, { factor: v === "__number__" ? 1 : { tunable: v } })}
                        >
                          <SelectTrigger className="h-9 w-44" aria-label="Factor">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__number__">A number</SelectItem>
                            {draft.tunables.map((t) => (
                              <SelectItem key={t.key} value={t.key}>
                                {t.label || t.key}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {typeof f.factor === "number" && (
                          <Input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={Number.isFinite(f.factor) ? f.factor : ""}
                            onChange={(e) => setFormula(i, { factor: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                            aria-label="Number"
                            className="h-9 w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        )}
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox checked={f.round === "up"} onCheckedChange={(on) => setFormula(i, { round: on ? "up" : "none" })} />
                          Round up
                        </label>
                        <p className="w-full text-xs text-muted-foreground">{describeFormula(f, draft)}</p>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="space-y-2 pt-2">
                <div className={SMALL_LABEL}>Calculator defaults</div>
                <p className="text-xs text-muted-foreground">Named numbers formulas can use (coverage per bag, pieces per sq ft…). Set here — they apply to every job.</p>
                {draft.tunables.map((t, i) => (
                  <div key={t.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={t.label}
                      onChange={(e) => set({ tunables: draft.tunables.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                      placeholder="Name, e.g. Coverage per yard"
                      aria-label="Default name"
                      className="h-9 min-w-[10rem] flex-1"
                    />
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={Number.isFinite(t.value) ? t.value : ""}
                      onChange={(e) => set({ tunables: draft.tunables.map((x, j) => (j === i ? { ...x, value: e.target.value === "" ? 0 : parseFloat(e.target.value) } : x)) })}
                      aria-label="Value"
                      className="h-9 w-24 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <Input
                      value={t.unit}
                      onChange={(e) => set({ tunables: draft.tunables.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })}
                      placeholder="Unit"
                      aria-label="Unit"
                      className="h-9 w-24"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${t.label || "default"}`}
                      onClick={() =>
                        set({
                          tunables: draft.tunables.filter((_, j) => j !== i),
                          // Formulas that used it fall back to a plain number.
                          line_items: draft.line_items.map((l) =>
                            l.formula && typeof l.formula.factor === "object" && l.formula.factor.tunable === t.key
                              ? { ...l, formula: { ...l.formula, factor: t.value } }
                              : l,
                          ),
                        })
                      }
                      className="rounded p-1.5 text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set({ tunables: [...draft.tunables, { key: keyFrom("default", draft.tunables.map((t) => t.key)), label: "", unit: "", value: 1 }] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add default
                </Button>
              </div>
            </TabsContent>

            {/* Quick Quote */}
            <TabsContent value="qq" className={cn(SECTION, "mt-0")}>
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                Offer Quick Quote for this type
                <Switch
                  checked={!!draft.quick_quote}
                  onCheckedChange={(on) =>
                    set({ quick_quote: on ? { total_key: totals[0]?.key ?? "", rate: 0, unit_label: totals[0]?.unit === "sq ft" ? "sf" : totals[0]?.unit === "LF" ? "lf" : "ea" } : null })
                  }
                  aria-label="Offer Quick Quote"
                />
              </label>
              {draft.quick_quote && (
                totals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a measurement (area, linear feet, count…) to price by.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className={SMALL_LABEL}>Price by</Label>
                      <Select value={draft.quick_quote.total_key} onValueChange={(v) => set({ quick_quote: { ...draft.quick_quote!, total_key: v } })}>
                        <SelectTrigger className="h-10" aria-label="Price by">
                          <SelectValue placeholder="Pick a measurement" />
                        </SelectTrigger>
                        <SelectContent>
                          {totals.map((t) => (
                            <SelectItem key={t.key} value={t.key}>
                              {t.label} ({t.unit || "#"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className={SMALL_LABEL}>
                        Rate ($ / {totals.find((t) => t.key === draft.quick_quote!.total_key)?.unit || "unit"})
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={Number.isFinite(draft.quick_quote.rate) ? draft.quick_quote.rate : ""}
                        onChange={(e) => set({ quick_quote: { ...draft.quick_quote!, rate: e.target.value === "" ? 0 : parseFloat(e.target.value) } })}
                        aria-label="Rate"
                        className="h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className={SMALL_LABEL}>Unit on the quote</Label>
                      <Input
                        value={draft.quick_quote.unit_label}
                        onChange={(e) => set({ quick_quote: { ...draft.quick_quote!, unit_label: e.target.value } })}
                        placeholder="sf, lf, ea"
                        aria-label="Unit on the quote"
                        className="h-10"
                      />
                    </div>
                  </div>
                )
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {existing ? (
            <Button variant="ghost" className="text-destructive" disabled={remove.isPending || save.isPending} onClick={() => remove.mutate()}>
              Remove setup
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {problem && <span className="text-xs font-semibold text-warning">{problem}</span>}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button className="font-bold" disabled={!!problem || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save setup
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const TypeSetupDialog = withErrorBoundary(TypeSetupDialogInner, "TypeSetupDialog");

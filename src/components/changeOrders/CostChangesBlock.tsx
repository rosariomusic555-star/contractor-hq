import { useEffect, useState, type ReactNode } from "react";
import { Calculator, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLaborBlock, type LaborDraft } from "@/components/materials/SectionLaborBlock";
import { cn, formatCurrency } from "@/lib/utils";
import { COST_TYPE_LABEL, LINE_COST_TYPES, LUMP_SUM_UNIT, laborFormula, lineCostWithTax, type LineCostType } from "@/lib/costPlanMath";
import { costChangeDelta, type CostChangeKind } from "@/lib/changeOrderCost";
import { useQuery } from "@tanstack/react-query";
import { COST_PLAN_TAX_RATE_KEY, getCostPlanTaxRate, type MaterialsSection } from "@/lib/api";

/** One planned-cost change while the change order is being edited. */
export interface DraftCostChange {
  id: string;
  /** The change order section (feature) it belongs to — a draft id until saved. */
  section_id: string;
  feature_id: string | null;
  kind: CostChangeKind;
  materials_item_id: string | null;
  materials_section_id: string | null;
  line: Record<string, unknown>;
  before: Record<string, unknown> | null;
}

const LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const KIND_LABEL: Record<CostChangeKind, string> = { add: "New line", edit: "Change", remove: "Remove", labor: "Labor" };

const signed = (v: number) => `${v < 0 ? "−" : "+"}${formatCurrency(Math.abs(v))}`;
const num = (v: unknown) => (v == null || v === "" ? "" : String(v));
const parse = (t: string) => {
  const n = Number(t.trim());
  return t.trim() === "" || !isFinite(n) ? null : n;
};

const laborOfSection = (s: MaterialsSection | undefined): LaborDraft => ({
  labor_mode: s?.labor_mode ?? null,
  labor_crew_size: s?.labor_crew_size == null ? null : Number(s.labor_crew_size),
  labor_days: s?.labor_days == null ? null : Number(s.labor_days),
  labor_hours_per_day: s?.labor_hours_per_day == null ? null : Number(s.labor_hours_per_day),
  labor_rate: s?.labor_rate == null ? null : Number(s.labor_rate),
  labor_lump_sum: s?.labor_lump_sum == null ? null : Number(s.labor_lump_sum),
  labor_man_hours: s?.labor_man_hours == null ? null : Number(s.labor_man_hours),
  labor_notes: "",
});

/**
 * A change order section's planned-cost side: how this change alters the
 * feature's Cost plan section — new lines, changed or removed existing lines,
 * and its labor. Nothing touches the Cost plan until the change order is
 * approved; the running delta feeds the totals and Project impact.
 */
export function CostChangesBlock({
  featureSection,
  changes,
  locked,
  laborRate,
  onAdd,
  onEdit,
  onRemove,
}: {
  /** The feature's Cost plan section (undefined: no feature picked, or no plan). */
  featureSection: MaterialsSection | undefined;
  changes: DraftCostChange[];
  locked: boolean;
  laborRate: number;
  onAdd: (c: Omit<DraftCostChange, "id" | "section_id" | "feature_id">) => void;
  onEdit: (id: string, patch: Partial<DraftCostChange>) => void;
  onRemove: (id: string) => void;
}) {
  // Added lines carry the default sales tax rate (0163), so the delta is
  // after tax like the Cost plan it lands in.
  const { data: defaultTaxRate = 0 } = useQuery({ queryKey: COST_PLAN_TAX_RATE_KEY, queryFn: getCostPlanTaxRate });
  const delta = changes.reduce((s, c) => s + costChangeDelta(c), 0);
  const lines = featureSection?.materials_items ?? [];
  const changedIds = new Set(changes.map((c) => c.materials_item_id).filter(Boolean));
  const hasLaborChange = changes.some((c) => c.kind === "labor");

  const snapshot = (id: string) => {
    const i = lines.find((l) => l.id === id);
    return i
      ? {
          name: i.name,
          quantity: Number(i.quantity),
          unit: i.unit ?? null,
          unit_cost: Number(i.unit_cost),
          waste_percent: Number(i.waste_percent ?? 0),
          cost_type: i.cost_type ?? "material",
          vendor: i.vendor ?? null,
          taxable: !!i.taxable,
          tax_rate: Number(i.tax_rate ?? 0),
        }
      : null;
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Calculator className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold text-foreground">Planned cost change</span>
        <span className={cn("ml-auto text-base font-extrabold tabular-nums", delta < 0 ? "text-success" : "text-foreground")}>
          {changes.length ? signed(delta) : "—"}
        </span>
      </div>

      {!featureSection ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Pick the feature this section changes (its name field) to change its Cost plan lines and labor.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Changes to “{featureSection.name}” in the Cost plan — applied only when this change order is approved.
          </p>

          <div className="mt-3 space-y-2.5">
            {changes.map((c) => (
              <div key={c.id} className="rounded-xl border border-hairline bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[c.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {c.kind === "add" ? "" : c.kind === "labor" ? laborFormula((c.before ?? {}) as never) ?? "No labor planned" : String(c.before?.name ?? "Line")}
                  </span>
                  <span className={cn("shrink-0 text-sm font-bold tabular-nums", costChangeDelta(c) < 0 ? "text-success" : "text-foreground")}>
                    {signed(costChangeDelta(c))}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => onRemove(c.id)}
                      aria-label="Remove this change"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {c.kind === "add" && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_2fr_1fr_1fr_1fr]">
                    <Field label="Type">
                      <Select
                        value={String(c.line.cost_type ?? "material")}
                        onValueChange={(v) =>
                          onEdit(c.id, {
                            line: {
                              ...c.line,
                              cost_type: v,
                              ...(v !== "material" && !c.line.unit ? { unit: LUMP_SUM_UNIT, quantity: 1 } : {}),
                            },
                          })
                        }
                        disabled={locked}
                      >
                        <SelectTrigger className="h-10">
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
                    </Field>
                    <Field label="Description" className="col-span-2 sm:col-span-1">
                      <Input
                        value={String(c.line.name ?? "")}
                        onChange={(e) => onEdit(c.id, { line: { ...c.line, name: e.target.value } })}
                        placeholder="e.g. Extra pavers"
                        disabled={locked}
                        className="h-10"
                      />
                    </Field>
                    <NumField label="Qty" value={c.line.quantity} disabled={locked} onChange={(v) => onEdit(c.id, { line: { ...c.line, quantity: v } })} />
                    <Field label="Unit">
                      <Input
                        value={String(c.line.unit ?? "")}
                        onChange={(e) => onEdit(c.id, { line: { ...c.line, unit: e.target.value } })}
                        placeholder="sq ft"
                        disabled={locked}
                        className="h-10"
                      />
                    </Field>
                    <NumField label="Unit cost" prefix="$" value={c.line.unit_cost} disabled={locked} onChange={(v) => onEdit(c.id, { line: { ...c.line, unit_cost: v } })} />
                  </div>
                )}

                {c.kind === "edit" && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="col-span-2 self-end text-xs text-muted-foreground">
                      <NowLine before={c.before} />
                    </div>
                    {/* Blank = unchanged (the current value shows as the placeholder). */}
                    <NumField label="New qty" value={c.line.quantity} placeholder={num(c.before?.quantity)} disabled={locked} onChange={(v) => onEdit(c.id, { line: withField(c.line, "quantity", v) })} />
                    <NumField label="New unit cost" prefix="$" value={c.line.unit_cost} placeholder={num(c.before?.unit_cost)} disabled={locked} onChange={(v) => onEdit(c.id, { line: withField(c.line, "unit_cost", v) })} />
                  </div>
                )}

                {c.kind === "labor" && (
                  <SectionLaborBlock
                    value={{ ...(c.line as unknown as LaborDraft), labor_notes: "" }}
                    defaultRate={laborRate}
                    onChange={(patch) => {
                      const { labor_notes: _notes, ...rest } = patch;
                      onEdit(c.id, { line: { ...c.line, ...rest } });
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {!locked && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAdd({ kind: "add", materials_item_id: null, materials_section_id: featureSection.id, line: { cost_type: "material", name: "", quantity: 0, unit: "", unit_cost: 0, tax_rate: defaultTaxRate }, before: null })}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border bg-card px-3.5 text-sm font-bold text-primary hover:border-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                New line
              </button>
              {lines.some((l) => !changedIds.has(l.id)) && (
                <Select
                  value=""
                  onValueChange={(v) => {
                    const [kind, id] = v.split(":");
                    onAdd({ kind: kind as CostChangeKind, materials_item_id: id, materials_section_id: featureSection.id, line: {}, before: snapshot(id) });
                  }}
                >
                  <SelectTrigger className="h-11 w-auto gap-1.5 rounded-xl border-[1.5px] border-dashed bg-card px-3.5 text-sm font-bold text-primary">
                    <SelectValue placeholder="Change or remove a line" />
                  </SelectTrigger>
                  <SelectContent>
                    {lines
                      .filter((l) => !changedIds.has(l.id))
                      .flatMap((l) => [
                        <SelectItem key={`edit:${l.id}`} value={`edit:${l.id}`}>
                          Change · {l.name || "Untitled"}
                        </SelectItem>,
                        <SelectItem key={`remove:${l.id}`} value={`remove:${l.id}`}>
                          Remove · {l.name || "Untitled"}
                        </SelectItem>,
                      ])}
                  </SelectContent>
                </Select>
              )}
              {!hasLaborChange && (
                <button
                  type="button"
                  onClick={() => {
                    const before = laborOfSection(featureSection);
                    const { labor_notes: _n, ...labor } = before;
                    onAdd({
                      kind: "labor",
                      materials_item_id: null,
                      materials_section_id: featureSection.id,
                      line: labor.labor_mode ? { ...labor } : { ...labor, labor_mode: "crew", labor_hours_per_day: 8, labor_rate: laborRate },
                      before: labor,
                    });
                  }}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border bg-card px-3.5 text-sm font-bold text-primary hover:border-primary hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  Change labor
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Sets a field, or drops it when blank (an edit's "unchanged"). */
const withField = (line: Record<string, unknown>, key: string, v: number | null) => {
  const { [key]: _old, ...rest } = line;
  return v == null ? rest : { ...rest, [key]: v };
};

/** "Now 706 sq ft × $8.00 + 3.5% waste + 8.25% tax = $6,327.95" — the
 * waste and tax are in the total, so they're spelled out. */
function NowLine({ before }: { before: Record<string, unknown> | null }) {
  const b = before ?? {};
  const qty = Number(b.quantity ?? 0);
  const waste = Number(b.waste_percent ?? 0);
  const taxRate = b.taxable ? Number(b.tax_rate ?? 0) : 0;
  const pct = (v: number) => `${Number(v.toFixed(3))}%`;
  const total = lineCostWithTax({
    quantity: qty,
    unit_cost: Number(b.unit_cost ?? 0),
    waste_percent: waste,
    cost_type: (b.cost_type as LineCostType) ?? "material",
    taxable: !!b.taxable,
    tax_rate: Number(b.tax_rate ?? 0),
  });
  return (
    <>
      Now {qty}
      {b.unit ? ` ${b.unit}` : ""} × {formatCurrency(Number(b.unit_cost ?? 0))}
      {waste > 0 && ` + ${pct(waste)} waste`}
      {taxRate > 0 && ` + ${pct(taxRate)} tax`} = {formatCurrency(total)}
    </>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <div className={LABEL}>{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  prefix,
  placeholder,
  disabled,
}: {
  label: string;
  value: unknown;
  onChange: (v: number | null) => void;
  prefix?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  // Local text so "4." can be typed; follows outside changes (discard).
  const [text, setText] = useState(num(value));
  useEffect(() => {
    if (parse(text) !== (value == null || value === "" ? null : Number(value))) setText(num(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parse(e.target.value));
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("h-10", prefix && "pl-6")}
        />
      </div>
    </Field>
  );
}

import type { SmartSectionTemplate, TunableDefault } from "./smartSections/types";
import type { QuickQuoteTemplate } from "./quickQuote/types";
import type { LineCostType } from "./costPlanMath";

/* =============================================================================
 * Custom project type setups (0159) — a contractor-made type's measurement
 * card, starting Cost plan lines, calculator formulas and Quick Quote rate,
 * all as data (Settings › Project types › Set up). Pure, except for the
 * small registry below that the app fills from the loaded setups, so the
 * existing template lookups (findSmartSectionTemplate / findQuickQuoteTemplate)
 * and measurement helpers can find a setup by its build type id
 * `cfg:<category id>`.
 * ========================================================================== */

/** Measurement building blocks. Numbers become totals; select / notes are
 * just recorded. */
export type FieldKind = "area" | "runs" | "count" | "length" | "height" | "depth" | "number" | "select" | "notes";

export interface MeasureField {
  key: string;
  kind: FieldKind;
  label: string;
  /** "number": its unit; height / depth: "in" or "ft". */
  unit?: string;
  /** "select": the choices. */
  options?: string[];
}

/** qty = total × factor, total ÷ factor ("per": e.g. 80 sq ft per bag), or
 * just the factor when there's no total (a fixed count). */
export interface LineFormula {
  total: string | null;
  op: "times" | "per";
  /** A number, or one of the setup's tunables by key. */
  factor: number | { tunable: string };
  round: "up" | "none";
}

export interface ConfigLine {
  id: string;
  name: string;
  cost_type: LineCostType;
  formula?: LineFormula | null;
  /** 0162 — a material line's default category (null/absent = none). */
  material_category_id?: string | null;
  /** 0162 — the line's default description. */
  description?: string | null;
}

export interface ConfigTunable {
  key: string;
  label: string;
  unit: string;
  value: number;
}

export interface ConfigQuickQuote {
  /** Which measurement total is priced (a field key). */
  total_key: string;
  rate: number;
  /** Written on the quote line, e.g. "sf", "lf", "ea". */
  unit_label: string;
}

export interface TypeConfig {
  category_id: string;
  based_on: string | null;
  fields: MeasureField[];
  summary_keys: string[];
  line_items: ConfigLine[];
  tunables: ConfigTunable[];
  quick_quote: ConfigQuickQuote | null;
}

/** What a measurement instance of a set-up type stores in `data`. */
export interface ConfigData {
  /** The type (category id) — how the card finds its setup. */
  cfg: string;
  values: Record<string, unknown>;
}

export interface AreaValue {
  mode: "dims" | "sqft";
  length_ft: number | null;
  width_ft: number | null;
  sqft: number | null;
}

export const FIELD_KINDS: { value: FieldKind; label: string; hint: string }[] = [
  { value: "area", label: "Area", hint: "Length × width, or a total sq ft" },
  { value: "runs", label: "Linear feet", hint: "One or more runs, added up" },
  { value: "count", label: "Count", hint: "How many (each)" },
  { value: "length", label: "Length", hint: "One length in feet" },
  { value: "height", label: "Height", hint: "Inches or feet" },
  { value: "depth", label: "Depth", hint: "Inches" },
  { value: "number", label: "Number", hint: "Any number with your unit" },
  { value: "select", label: "Dropdown", hint: "Pick one of your options" },
  { value: "notes", label: "Notes", hint: "Free text" },
];

const NUMERIC: FieldKind[] = ["area", "runs", "count", "length", "height", "depth", "number"];
export const isNumericField = (f: Pick<MeasureField, "kind">) => NUMERIC.includes(f.kind);

/** The unit a field's total is in. */
export function fieldUnit(f: MeasureField): string {
  switch (f.kind) {
    case "area":
      return "sq ft";
    case "runs":
      return "LF";
    case "count":
      return "ea";
    case "length":
      return "ft";
    case "height":
      return f.unit === "ft" ? "ft" : "in";
    case "depth":
      return "in";
    case "number":
      return f.unit?.trim() || "";
    default:
      return "";
  }
}

/** The totals a setup produces — what summaries, formulas and Quick Quote pick from. */
export const totalOptions = (c: Pick<TypeConfig, "fields">) =>
  c.fields.filter(isNumericField).map((f) => ({ key: f.key, label: f.label, unit: fieldUnit(f) }));

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function areaSqft(v: unknown): number {
  const a = (v ?? {}) as Partial<AreaValue>;
  return a.mode === "sqft" ? num(a.sqft) : num(a.length_ft) * num(a.width_ft);
}

/** One instance's totals, keyed by field key (numeric fields only, > 0). */
export function configTotals(config: Pick<TypeConfig, "fields"> | null, data: Partial<ConfigData> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!config) return out;
  const values = data?.values ?? {};
  for (const f of config.fields) {
    if (!isNumericField(f)) continue;
    const v = values[f.key];
    const total =
      f.kind === "area" ? areaSqft(v) : f.kind === "runs" ? (Array.isArray(v) ? v.reduce((s: number, x) => s + num(x), 0) : 0) : num(v);
    if (total > 0) out[f.key] = Math.round(total * 100) / 100;
  }
  return out;
}

const fmtNum = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** "300 sq ft · 40 LF · 2 ea" — the chosen summary totals (or all of them),
 * then any dropdown answers. null when nothing's filled in. */
export function configSummary(config: TypeConfig | null, data: Partial<ConfigData> | null | undefined): string | null {
  if (!config) return null;
  const totals = configTotals(config, data);
  const keys = config.summary_keys.length ? config.summary_keys : config.fields.filter(isNumericField).map((f) => f.key);
  const parts: string[] = [];
  for (const k of keys) {
    const f = config.fields.find((x) => x.key === k);
    if (!f || !totals[k]) continue;
    const unit = fieldUnit(f);
    parts.push(`${fmtNum(totals[k])}${unit ? ` ${unit}` : ""}`);
  }
  for (const f of config.fields) {
    if (f.kind === "select" && keys.includes(f.key)) {
      const v = data?.values?.[f.key];
      if (typeof v === "string" && v) parts.push(v);
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Anything typed (a number, an option, notes). */
export function configHasData(data: Partial<ConfigData> | null | undefined): boolean {
  const any = (v: unknown): boolean =>
    typeof v === "number" ? v > 0 : typeof v === "string" ? !!v.trim() : Array.isArray(v) ? v.some(any) : v && typeof v === "object" ? Object.values(v).some(any) : false;
  return any(data?.values ?? {});
}

/** Resolves a formula's factor (a number or a tunable). */
function factorOf(f: LineFormula, tunables: Record<string, number>): number {
  return typeof f.factor === "number" ? f.factor : num(tunables[f.factor.tunable]);
}

/** qty for one formula; 0 when it can't be computed (missing total, ÷ 0). */
export function formulaQuantity(f: LineFormula, totals: Record<string, unknown>, tunables: Record<string, number>): number {
  const factor = factorOf(f, tunables);
  let qty: number;
  if (f.total == null) qty = factor;
  else {
    const t = num(totals[f.total]);
    if (t <= 0) return 0;
    if (f.op === "per") {
      if (factor <= 0) return 0;
      qty = t / factor;
    } else qty = t * factor;
  }
  if (!(qty > 0)) return 0;
  return f.round === "up" ? Math.ceil(qty - 1e-9) : Math.round(qty * 100) / 100;
}

/** "Area × 1.05", "Area ÷ Bag coverage", "2 (fixed)" — a formula in words. */
export function describeFormula(f: LineFormula | null | undefined, config: Pick<TypeConfig, "fields" | "tunables">): string {
  if (!f) return "No formula — the calculator leaves this line alone";
  const factor = typeof f.factor === "number" ? f.factor.toLocaleString(undefined, { maximumFractionDigits: 4 }) : config.tunables.find((t) => t.key === (f.factor as { tunable: string }).tunable)?.label ?? "?";
  const round = f.round === "up" ? ", rounded up" : "";
  if (f.total == null) return `${factor} (fixed)${round}`;
  const total = config.fields.find((x) => x.key === f.total)?.label ?? "?";
  return `${total} ${f.op === "per" ? "÷" : "×"} ${factor}${round}`;
}

// ---------------------------------------------------------------------------
// Build type ids + registry
// ---------------------------------------------------------------------------

export const CONFIG_PREFIX = "cfg:";
export const configBuildType = (categoryId: string) => `${CONFIG_PREFIX}${categoryId}`;
export const isConfigBuildType = (bt: string | null | undefined): bt is string => !!bt && bt.startsWith(CONFIG_PREFIX);
export const categoryIdOfBuildType = (bt: string) => bt.slice(CONFIG_PREFIX.length);

const registry = new Map<string, { config: TypeConfig; label: string }>();

/** Filled from the loaded setups (useTypeConfigs) — label = the type's name. */
export function setTypeConfigs(list: { config: TypeConfig; label: string }[]) {
  registry.clear();
  for (const e of list) registry.set(e.config.category_id, e);
}

export const getTypeConfig = (categoryId: string | null | undefined): TypeConfig | null =>
  (categoryId && registry.get(categoryId)?.config) || null;

export const getTypeConfigLabel = (categoryId: string): string => registry.get(categoryId)?.label ?? "Custom type";

/** A set-up type's measurement card has something to show. */
export const hasMeasurementSetup = (c: TypeConfig | null): c is TypeConfig => !!c && c.fields.length > 0;

// ---------------------------------------------------------------------------
// Setup → the app's existing template shapes
// ---------------------------------------------------------------------------

/** The calculator template for a set-up type: one slot per line, one
 * number question per measurement total a formula uses (pre-filled from
 * the card), the setup's tunables as the calculator defaults. */
export function smartTemplateFromConfig(config: TypeConfig, label: string): SmartSectionTemplate | null {
  if (config.line_items.length === 0) return null;
  const options = totalOptions(config);
  const usedTotals = [...new Set(config.line_items.map((l) => l.formula?.total).filter((k): k is string => !!k))];
  const tunableSlot = (key: string) =>
    config.line_items.find((l) => l.formula && typeof l.formula.factor === "object" && l.formula.factor.tunable === key)?.id ??
    config.line_items[0].id;
  const tunables: TunableDefault[] = config.tunables.map((t) => ({
    key: t.key,
    label: t.label,
    unit: t.unit,
    defaultValue: t.value,
    relatedSlotKey: tunableSlot(t.key),
  }));
  return {
    id: configBuildType(config.category_id),
    label,
    lineItemSlots: config.line_items.map((l) => ({
      key: l.id,
      defaultName: l.name,
      defaultCategoryId: l.cost_type === "material" ? (l.material_category_id ?? null) : null,
      defaultDescription: l.description ?? null,
    })),
    slotCostTypes: Object.fromEntries(
      config.line_items.filter((l) => l.cost_type !== "material").map((l) => [l.id, l.cost_type]),
    ) as SmartSectionTemplate["slotCostTypes"],
    questions: usedTotals.map((k) => {
      const o = options.find((x) => x.key === k);
      return { key: k, label: o?.label ?? k, type: "number" as const, unit: o?.unit ?? "" };
    }),
    tunables,
    calculate: (answers) => {
      const tunableValues: Record<string, number> = Object.fromEntries(config.tunables.map((t) => [t.key, num(answers[t.key]) || t.value]));
      return config.line_items
        .filter((l) => l.formula)
        .map((l) => {
          const unitTotal = l.formula!.total ? options.find((o) => o.key === l.formula!.total)?.unit : undefined;
          return {
            slotKey: l.id,
            quantity: formulaQuantity(l.formula!, answers, tunableValues),
            unit: l.formula!.op === "per" ? "ea" : unitTotal || "ea",
          };
        });
    },
  };
}

/** The Quick Quote template for a set-up type with a rate. */
export function quickQuoteFromConfig(config: TypeConfig, label: string): QuickQuoteTemplate | null {
  const qq = config.quick_quote;
  if (!qq) return null;
  const field = config.fields.find((f) => f.key === qq.total_key);
  if (!field) return null;
  const unit = fieldUnit(field);
  return {
    id: configBuildType(config.category_id),
    label,
    pricingUnit: `$ / ${unit || "unit"}`,
    lineItemUnit: qq.unit_label || unit || "ea",
    defaultRate: qq.rate,
    questions: [{ key: qq.total_key, label: field.label, type: "number", unit }],
    quantity: (a) => num(Number(a[qq.total_key])),
    fallbackDescription: (a) => {
      const q = num(Number(a[qq.total_key]));
      return `${label}${q ? ` — ${fmtNum(q)} ${unit}` : ""}, including materials and installation.`;
    },
  };
}

/** Measurement totals → calculator / Quick Quote answers (same keys). */
export const configPrefill = (totals: Record<string, unknown>): Record<string, number> =>
  Object.fromEntries(Object.entries(totals).filter(([, v]) => typeof v === "number" && v > 0)) as Record<string, number>;

export const emptyTypeConfig = (categoryId: string): TypeConfig => ({
  category_id: categoryId,
  based_on: null,
  fields: [],
  summary_keys: [],
  line_items: [],
  tunables: [],
  quick_quote: null,
});

/** "Back patio area" → "back_patio_area" — a stable key for a new field / tunable. */
export function keyFrom(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

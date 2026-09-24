import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { listCategories, listProjectMeasurements, saveProjectMeasurements } from "@/lib/api";
import {
  FREE_ROW_UNITS,
  GENERAL_GROUP,
  GENERAL_GROUP_KEY,
  fieldVisible,
  groupKeyOf,
  isFreeRowKey,
  measurementGroupsFor,
  totalAreaSqft,
  unitSuffix,
  type MeasurementField,
  type MeasurementGroup,
  type MeasurementRow,
} from "@/lib/measurements";

const FIELD_LABEL = "text-[11px] font-semibold text-muted-foreground";
// Stable empty default — a fresh [] per render would re-fire the reseed effect forever.
const NO_ROWS: MeasurementRow[] = [];

/**
 * The project's measurements, one group per selected Project type — fields
 * per build type come from src/lib/measurements.ts. Shared by the project
 * page and the opportunity page, so both read/write the same rows
 * (project_measurements, 0091).
 *
 * Draft + explicit Save (the app's editor convention): edits stay local
 * until Save, which diffs against the stored rows. `ensureProjectId` covers
 * the opportunity page before its project exists — the first save lazily
 * creates it, same as the first photo/sheet/quote there.
 */
export function ProjectMeasurementsCard({
  projectId,
  categoryIds,
  ensureProjectId,
  onSaved,
  hint,
}: {
  projectId: string | null;
  /** The selected Project types (Job Category ids). */
  categoryIds: string[];
  ensureProjectId?: () => Promise<string>;
  onSaved?: () => void;
  /** Small muted guidance under the title (the opportunity page uses it to
   * say when to fill this in). */
  hint?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: serverRows = NO_ROWS } = useQuery({
    queryKey: ["project-measurements", projectId],
    queryFn: () => listProjectMeasurements(projectId!),
    enabled: !!projectId,
  });

  const [draft, setDraft] = useState<MeasurementRow[]>([]);
  const dirty = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => {
    dirty.current = true;
    setIsDirty(true);
  };
  const reseed = () => {
    setDraft(serverRows.map((r) => ({ ...r })));
    dirty.current = false;
    setIsDirty(false);
  };
  useEffect(() => {
    if (!dirty.current) reseed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverRows]);

  const typeGroups = useMemo(() => measurementGroupsFor(categoryIds, categories), [categoryIds, categories]);
  const hasGeneralRows = draft.some((r) => groupKeyOf(r) === GENERAL_GROUP_KEY);
  const groups: MeasurementGroup[] =
    hasGeneralRows || typeGroups.length === 0 ? [...typeGroups, GENERAL_GROUP] : typeGroups;

  const rowsOf = (g: MeasurementGroup) => draft.filter((r) => groupKeyOf(r) === g.key);

  const newRow = (g: MeasurementGroup, fieldKey: string, unit: string | null): MeasurementRow => ({
    id: crypto.randomUUID(),
    project_id: projectId ?? "",
    build_type: g.build_type,
    category_id: g.category_id,
    field_key: fieldKey,
    label: null,
    value: null,
    value_text: null,
    unit,
    sort_order: draft.length,
  });

  const setField = (g: MeasurementGroup, field: MeasurementField, patch: Partial<MeasurementRow>) => {
    markDirty();
    setDraft((d) => {
      const i = d.findIndex((r) => groupKeyOf(r) === g.key && r.field_key === field.key);
      if (i >= 0) return d.map((r, j) => (j === i ? { ...r, ...patch } : r));
      return [...d, { ...newRow(g, field.key, field.unit), ...patch }];
    });
  };

  const addFreeRow = (g: MeasurementGroup, patch: Partial<MeasurementRow> = {}) => {
    markDirty();
    setDraft((d) => [...d, { ...newRow(g, `custom_${crypto.randomUUID().replace(/-/g, "")}`, "sq_ft"), ...patch }]);
  };
  const updateRow = (id: string, patch: Partial<MeasurementRow>) => {
    markDirty();
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRow = (id: string) => {
    markDirty();
    setDraft((d) => d.filter((r) => r.id !== id));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const id = projectId ?? (await ensureProjectId!());
      // Empty rows aren't stored: a config field with no value, or a free
      // row with neither a label nor a value.
      const keep = draft.filter((r) =>
        isFreeRowKey(r.field_key) ? !!r.label?.trim() || r.value != null : r.value != null || !!r.value_text,
      );
      const keepIds = new Set(keep.map((r) => r.id));
      const deleteIds = serverRows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
      const serverById = new Map(serverRows.map((r) => [r.id, r]));
      const changed = keep
        .map((r) => ({ ...r, project_id: id, label: r.label?.trim() || null }))
        .filter((r) => JSON.stringify(r) !== JSON.stringify(serverById.get(r.id)));
      const visibleKeys = new Set([...typeGroups.map((g) => g.key), GENERAL_GROUP_KEY]);
      await saveProjectMeasurements(id, changed, deleteIds, totalAreaSqft(keep, visibleKeys));
      return id;
    },
    onSuccess: (id) => {
      dirty.current = false;
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ["project-measurements", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      onSaved?.();
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't save measurements", description: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Measurements</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <p className="mt-1 text-[11px] text-muted-subtle">
        Total sq ft drives the Labor page's productivity metrics (hours/100sf, cost/sf).
      </p>
      {typeGroups.length === 0 && (
        <p className="mt-1 text-[11px] text-muted-subtle">Pick a project type to get its measurement fields.</p>
      )}

      <div className="mt-3 space-y-4">
        {groups.map((g) => {
          const rows = rowsOf(g);
          const freeRows = rows.filter((r) => isFreeRowKey(r.field_key));
          const visibleFields = g.fields.filter((f) => fieldVisible(f, rows));
          // A type with no configured fields (unmapped, "Other", General)
          // always shows at least one free row to type into.
          const showBlankFreeRow = g.fields.length === 0 && freeRows.length === 0;
          return (
            <div key={g.key} className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-subtle">{g.title}</div>
              {visibleFields.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleFields.map((f) => {
                    const row = rows.find((r) => r.field_key === f.key);
                    return (
                      <div key={f.key} className="space-y-1">
                        <div className={FIELD_LABEL}>{f.label}</div>
                        {f.kind === "choice" ? (
                          <div className="flex gap-1.5">
                            {f.options!.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                onClick={() => setField(g, f, { value_text: o.value })}
                                className={cn(
                                  "h-9 rounded-md border px-3 text-sm font-semibold transition-colors",
                                  row?.value_text === o.value
                                    ? "border-primary bg-primary/15 text-foreground"
                                    : "border-input bg-background text-muted-foreground hover:bg-muted/50",
                                )}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <NumberWithSuffix
                            value={row?.value ?? null}
                            suffix={unitSuffix(f.unit)}
                            onChange={(value) => setField(g, f, { value })}
                            ariaLabel={`${g.title} ${f.label}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {freeRows.map((r) => (
                <FreeRow
                  key={r.id}
                  row={r}
                  onChange={(patch) => updateRow(r.id, patch)}
                  onRemove={() => removeRow(r.id)}
                />
              ))}
              {showBlankFreeRow && <FreeRow row={null} onChange={(patch) => addFreeRow(g, patch)} />}

              <button
                type="button"
                onClick={() => addFreeRow(g)}
                className="text-xs font-bold text-primary hover:underline"
              >
                + Add measurement
              </button>
            </div>
          );
        })}
      </div>

      {isDirty && (
        <div className="mt-4 flex justify-end gap-2 border-t border-hairline pt-3">
          <Button size="sm" variant="outline" onClick={reseed} disabled={saveMut.isPending}>
            Discard
          </Button>
          <Button size="sm" className="font-bold" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save measurements"}
          </Button>
        </div>
      )}
    </section>
  );
}

function NumberWithSuffix({
  value,
  suffix,
  onChange,
  ariaLabel,
  className,
}: {
  value: number | null;
  suffix: string;
  onChange: (v: number | null) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-9 w-28"
        aria-label={ariaLabel}
      />
      {suffix && <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** Label + number + unit picker. `row` null renders an empty row whose first
 * edit creates it. */
function FreeRow({
  row,
  onChange,
  onRemove,
}: {
  row: MeasurementRow | null;
  onChange: (patch: Partial<MeasurementRow>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={row?.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Label (e.g. Border)"
        className="h-9 min-w-[140px] flex-1"
        aria-label="Measurement label"
      />
      <Input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={row?.value ?? ""}
        onChange={(e) => onChange({ value: e.target.value === "" ? null : Number(e.target.value) })}
        className="h-9 w-24"
        aria-label="Measurement value"
      />
      <Select value={row?.unit ?? "sq_ft"} onValueChange={(unit) => onChange({ unit })}>
        <SelectTrigger className="h-9 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FREE_ROW_UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {unitSuffix(u)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-subtle hover:text-destructive"
          aria-label="Remove measurement"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

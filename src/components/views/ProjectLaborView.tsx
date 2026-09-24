import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { KpiCard } from "@/components/common/KpiCard";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  getProject,
  listCategories,
  projectCategoryIds,
  listEmployees,
  getBusinessProfile,
  listLaborPlanEntries,
  upsertLaborPlanEntry,
  deleteLaborPlanEntry,
  listLaborEntries,
  createLaborEntry,
  deleteLaborEntry,
  logProjectEvent,
  type Category,
  type LaborPlanEntry,
} from "@/lib/api";
import { laborRollupsByScope, laborTotals, productivityMetrics, GENERAL_SCOPE_KEY, type ScopeLaborRollup } from "@/lib/laborPlan";
import { BackLink } from "@/components/common/BackLink";

const CUSTOM_WORKER = "__custom__";

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ---------------------------------------------------------------------------
// Draft rows for the Labor Plan editor
// ---------------------------------------------------------------------------

interface DraftRow {
  key: string; // category id, or GENERAL_SCOPE_KEY
  categoryId: string | null;
  serverId: string | null; // existing labor_plan_entries.id, null if unsaved
  plannedHours: string;
  hourlyRate: string;
  plannedCost: string;
  notes: string;
}

function seedRows(categories: Category[], projectCatIds: string[], entries: LaborPlanEntry[]): DraftRow[] {
  const byCategory = new Map(entries.map((e) => [e.category_id ?? GENERAL_SCOPE_KEY, e]));
  const keys = new Set<string>([...projectCatIds, ...entries.map((e) => e.category_id ?? GENERAL_SCOPE_KEY)]);
  const rows = [...keys].map((key): DraftRow => {
    const categoryId = key === GENERAL_SCOPE_KEY ? null : key;
    const entry = byCategory.get(key);
    return {
      key,
      categoryId,
      serverId: entry?.id ?? null,
      plannedHours: entry?.planned_hours != null ? String(entry.planned_hours) : "",
      hourlyRate: entry?.hourly_rate != null ? String(entry.hourly_rate) : "",
      plannedCost: entry?.planned_cost != null ? String(entry.planned_cost) : "",
      notes: entry?.notes ?? "",
    };
  });
  // General always available, even with nothing planned yet.
  if (!rows.some((r) => r.categoryId === null)) {
    rows.push({ key: GENERAL_SCOPE_KEY, categoryId: null, serverId: null, plannedHours: "", hourlyRate: "", plannedCost: "", notes: "" });
  }
  return rows.sort((a, b) => (a.categoryId === null ? 1 : b.categoryId === null ? -1 : 0));
}

function rowIsBlank(row: DraftRow): boolean {
  return !row.plannedHours && !row.hourlyRate && !row.plannedCost && !row.notes.trim();
}

export function ProjectLaborView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const {
    data: planEntries = [],
    isLoading: planLoading,
  } = useQuery({ queryKey: ["labor-plan-entries", { project: id }], queryFn: () => listLaborPlanEntries(id) });
  const { data: actualEntries = [] } = useQuery({
    queryKey: ["labor-entries", { project: id }],
    queryFn: () => listLaborEntries(id),
  });

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const projectCatIds = project ? projectCategoryIds(project) : [];

  // Draft + explicit Save (this app's convention for any multi-field
  // line-item editor — see src/lib/laborPlan.ts's doc comment and
  // DraftSaveBar). One row per scope, keyed by category id (or
  // GENERAL_SCOPE_KEY) rather than a synthetic tmp-id — a scope is
  // naturally unique per project, so there's nothing to diff by identity.
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const dirty = useRef(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (dirty.current || !project) return;
    setDraft(seedRows(categories, projectCatIds, planEntries));
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planEntries, project?.id, categories.length]);

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    dirty.current = true;
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    dirty.current = true;
    setDraft((rows) => rows.filter((r) => r.key !== key));
  };

  const addScopeRow = (categoryId: string) => {
    if (draft.some((r) => r.categoryId === categoryId)) return;
    dirty.current = true;
    setDraft((rows) => [
      ...rows.filter((r) => r.categoryId !== null),
      { key: categoryId, categoryId, serverId: null, plannedHours: "", hourlyRate: "", plannedCost: "", notes: "" },
      ...rows.filter((r) => r.categoryId === null),
    ]);
  };

  const discardDraft = () => {
    dirty.current = false;
    setDraft(seedRows(categories, projectCatIds, planEntries));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const serverByKey = new Map(planEntries.map((e) => [e.category_id ?? GENERAL_SCOPE_KEY, e]));
      for (const row of draft) {
        const server = serverByKey.get(row.key);
        const plannedHours = row.plannedHours ? Number(row.plannedHours) : null;
        const hourlyRate = row.hourlyRate ? Number(row.hourlyRate) : null;
        const plannedCost = hourlyRate != null && plannedHours != null ? plannedHours * hourlyRate : Number(row.plannedCost) || 0;
        const changed =
          !server ||
          server.planned_hours !== plannedHours ||
          server.hourly_rate !== hourlyRate ||
          Number(server.planned_cost) !== plannedCost ||
          (server.notes ?? "") !== row.notes;
        if (!changed) continue;
        if (!server && rowIsBlank(row)) continue; // never persist an empty new row
        await upsertLaborPlanEntry({
          project_id: id,
          category_id: row.categoryId,
          planned_hours: plannedHours,
          hourly_rate: hourlyRate,
          planned_cost: plannedCost,
          notes: row.notes.trim() || null,
        });
      }
      // A row the user removed that had a server-backed entry — delete it.
      const draftKeys = new Set(draft.map((r) => r.key));
      for (const entry of planEntries) {
        const key = entry.category_id ?? GENERAL_SCOPE_KEY;
        if (!draftKeys.has(key)) await deleteLaborPlanEntry(entry.id);
      }
    },
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["labor-plan-entries", { project: id }] });
      toast({ title: "Labor Plan saved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save Labor Plan", description: err.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------
  // Actual labor log
  // ---------------------------------------------------------------------

  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logCategoryId, setLogCategoryId] = useState<string>(GENERAL_SCOPE_KEY);
  const [logWorker, setLogWorker] = useState<string>(CUSTOM_WORKER);
  const [logWorkerName, setLogWorkerName] = useState("");
  const [logHours, setLogHours] = useState("");
  const [logRate, setLogRate] = useState("");
  const [logCost, setLogCost] = useState("");
  const [logNote, setLogNote] = useState("");

  const onEmployeePick = (value: string) => {
    setLogWorker(value);
    if (value !== CUSTOM_WORKER) {
      const emp = employees.find((e) => e.id === value);
      const rate = emp?.default_hourly_rate ?? businessProfile?.default_labor_rate;
      if (rate != null) setLogRate(String(rate));
    }
  };

  const logCostComputed = logRate && logHours ? Number(logHours) * Number(logRate) : null;

  const logMut = useMutation({
    mutationFn: () => {
      const hours = parseFloat(logHours);
      const rate = logRate ? parseFloat(logRate) : null;
      const cost = logCostComputed ?? (parseFloat(logCost) || 0);
      return createLaborEntry({
        project_id: id,
        category_id: logCategoryId === GENERAL_SCOPE_KEY ? null : logCategoryId,
        employee_id: logWorker === CUSTOM_WORKER ? null : logWorker,
        worker_name: logWorker === CUSTOM_WORKER ? logWorkerName.trim() || null : null,
        entry_date: logDate,
        hours,
        hourly_rate: rate,
        cost,
      });
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ["labor-entries", { project: id }] });
      void logProjectEvent(id, "labor_logged", `Labor: ${pluralize(Number(entry.hours), "hr")} · ${formatCurrency(Number(entry.cost))}`);
      qc.invalidateQueries({ queryKey: ["project-events", id] });
      setLogHours("");
      setLogRate("");
      setLogCost("");
      setLogNote("");
      setLogWorkerName("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteEntryMut = useMutation({
    mutationFn: (entryId: string) => deleteLaborEntry(entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labor-entries", { project: id }] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // ---------------------------------------------------------------------
  // Rollups
  // ---------------------------------------------------------------------

  const rollups = laborRollupsByScope(planEntries, actualEntries, categories);
  const totals = laborTotals(rollups);
  const productivity = productivityMetrics(project?.size_sqft, totals);

  const availableCategoriesToAdd = categories.filter((c) => !draft.some((r) => r.categoryId === c.id));
  const canSave = seeded && dirty.current;

  return (
    <div className="animate-fade-in max-w-4xl space-y-6 pb-40 md:pb-24">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Back to project</BackLink>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Labor Plan &amp; Tracking</h1>
        <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Planned hours" value={totals.plannedHours > 0 ? totals.plannedHours.toFixed(0) : "—"} />
        <KpiCard label="Planned cost" value={totals.plannedCost > 0 ? formatCurrency(totals.plannedCost) : "—"} />
        <KpiCard label="Actual hours" value={totals.actualHours > 0 ? totals.actualHours.toFixed(0) : "—"} />
        <KpiCard label="Actual cost" value={totals.actualCost > 0 ? formatCurrency(totals.actualCost) : "—"} />
      </div>

      {totals.plannedHours > 0 && totals.actualHours > 0 && (
        <VarianceBanner
          label="Whole project"
          varianceHours={totals.varianceHours}
          varianceCost={totals.varianceCost}
          variancePct={totals.variancePct}
        />
      )}

      {productivity && (
        <div className="card-surface p-5">
          <h3 className="text-base font-bold text-foreground">Productivity · {productivity.sizeSqft.toLocaleString()} sq ft</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Metric label="Planned hrs / 100sf" value={productivity.plannedHoursPer100Sqft?.toFixed(1) ?? "—"} />
            <Metric label="Actual hrs / 100sf" value={productivity.actualHoursPer100Sqft?.toFixed(1) ?? "—"} />
            <Metric label="Planned $/sf" value={productivity.plannedCostPerSqft != null ? formatCurrency(productivity.plannedCostPerSqft) : "—"} />
            <Metric label="Actual $/sf" value={productivity.actualCostPerSqft != null ? formatCurrency(productivity.actualCostPerSqft) : "—"} />
          </div>
        </div>
      )}

      {/* Labor Plan editor */}
      <div className="card-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-foreground">Labor Plan</h3>
          {availableCategoriesToAdd.length > 0 && (
            <Select onValueChange={addScopeRow}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full border-none bg-muted px-3 text-xs font-semibold text-foreground">
                <Plus className="h-3.5 w-3.5" />
                <SelectValue placeholder="Add scope" />
              </SelectTrigger>
              <SelectContent>
                {availableCategoriesToAdd.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {planLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="mt-3 space-y-3">
            {draft.map((row) => (
              <LaborPlanRow
                key={row.key}
                row={row}
                scopeName={row.categoryId ? (categoryNameById.get(row.categoryId) ?? "Uncategorized") : "General"}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={row.categoryId === null && draft.length === 1 ? undefined : () => removeRow(row.key)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Planned vs Actual by scope */}
      {rollups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground">Planned vs. Actual</h3>
          {rollups.map((r) => (
            <ScopeRollupCard key={r.categoryId ?? GENERAL_SCOPE_KEY} rollup={r} />
          ))}
        </div>
      )}

      {/* Actual labor log */}
      <div className="card-surface p-5">
        <h3 className="text-base font-bold text-foreground">Log labor</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={logCategoryId} onValueChange={setLogCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERAL_SCOPE_KEY}>General</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Worker</Label>
            <Select value={logWorker} onValueChange={onEmployeePick}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CUSTOM_WORKER}>Type a name…</SelectItem>
                {employees
                  .filter((e) => e.status === "active")
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {logWorker === CUSTOM_WORKER && (
            <div className="space-y-1.5">
              <Label>Worker name</Label>
              <Input value={logWorkerName} onChange={(e) => setLogWorkerName(e.target.value)} placeholder="e.g. Crew member" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Hours</Label>
            <Input type="number" step="0.25" min="0" value={logHours} onChange={(e) => setLogHours(e.target.value)} placeholder="8" />
          </div>
          <div className="space-y-1.5">
            <Label>Rate ($/hr, optional)</Label>
            <Input type="number" step="0.01" min="0" value={logRate} onChange={(e) => setLogRate(e.target.value)} placeholder="—" />
          </div>
          <div className="space-y-1.5">
            <Label>Cost</Label>
            {logCostComputed != null ? (
              <p className="flex h-10 items-center text-sm font-semibold text-foreground">{formatCurrency(logCostComputed)}</p>
            ) : (
              <Input type="number" step="0.01" min="0" value={logCost} onChange={(e) => setLogCost(e.target.value)} placeholder="0.00" />
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Note (optional)</Label>
            <Input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="e.g. Base prep, set pavers" />
          </div>
        </div>
        <Button
          className="mt-3 font-bold"
          disabled={
            !logHours ||
            Number.isNaN(parseFloat(logHours)) ||
            (logWorker === CUSTOM_WORKER && !logWorkerName.trim()) ||
            logMut.isPending
          }
          onClick={() => logMut.mutate()}
        >
          {logMut.isPending ? "Logging…" : "Log labor"}
        </Button>

        {actualEntries.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Scope</th>
                  <th className="px-2 py-2 font-medium">Worker</th>
                  <th className="px-2 py-2 text-right font-medium">Hours</th>
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {actualEntries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatDate(e.entry_date)}</td>
                    <td className="px-2 py-2 text-foreground">
                      {e.category_id ? (categoryNameById.get(e.category_id) ?? "Uncategorized") : "General"}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {e.employee_id ? (employees.find((emp) => emp.id === e.employee_id)?.name ?? "—") : (e.worker_name ?? "—")}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{Number(e.hours)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-foreground">{formatCurrency(Number(e.cost))}</td>
                    <td className="px-2 py-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-muted-foreground hover:text-destructive" aria-label="Delete labor entry">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this labor entry?</AlertDialogTitle>
                            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteEntryMut.mutate(e.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DraftSaveBar
        visible={canSave}
        onDiscard={discardDraft}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        label="Unsaved Labor Plan changes"
      />
    </div>
  );
}

function LaborPlanRow({
  row,
  scopeName,
  onChange,
  onRemove,
}: {
  row: DraftRow;
  scopeName: string;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove?: () => void;
}) {
  const computedCost = row.plannedHours && row.hourlyRate ? Number(row.plannedHours) * Number(row.hourlyRate) : null;

  return (
    <div className="rounded-xl border border-hairline p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{scopeName}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${scopeName}`}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Hours</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            value={row.plannedHours}
            onChange={(e) => onChange({ plannedHours: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Rate $/hr</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={row.hourlyRate}
            onChange={(e) => onChange({ hourlyRate: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Cost</Label>
          {computedCost != null ? (
            <p className="flex h-9 items-center text-sm font-semibold text-foreground">{formatCurrency(computedCost)}</p>
          ) : (
            <Input
              type="number"
              step="0.01"
              min="0"
              value={row.plannedCost}
              onChange={(e) => onChange({ plannedCost: e.target.value })}
              className="h-9"
            />
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Notes</Label>
          <Input value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} className="h-9" />
        </div>
      </div>
    </div>
  );
}

function ScopeRollupCard({ rollup }: { rollup: ScopeLaborRollup }) {
  const hasPlan = rollup.plannedHours > 0;
  const hasActual = rollup.actualHours > 0;
  return (
    <div className="card-surface p-5">
      <h4 className="text-sm font-bold text-foreground">{rollup.categoryName}</h4>
      <div className="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Metric label="Planned" value={hasPlan ? `${rollup.plannedHours.toFixed(0)} hr` : "—"} sub={hasPlan ? formatCurrency(rollup.plannedCost) : undefined} />
        <Metric label="Actual" value={hasActual ? `${rollup.actualHours.toFixed(0)} hr` : "—"} sub={hasActual ? formatCurrency(rollup.actualCost) : undefined} />
      </div>
      {hasPlan && hasActual && (
        <div className="mt-3 border-t border-hairline pt-3">
          <VarianceBanner
            varianceHours={rollup.varianceHours}
            varianceCost={rollup.varianceCost}
            variancePct={rollup.variancePct}
          />
        </div>
      )}
    </div>
  );
}

function VarianceBanner({
  label,
  varianceHours,
  varianceCost,
  variancePct,
}: {
  label?: string;
  varianceHours: number;
  varianceCost: number;
  variancePct: number | null;
}) {
  const over = varianceHours > 0;
  const sign = over ? "+" : "";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-4 py-3",
        over ? "bg-destructive/10" : "bg-success/10",
      )}
    >
      <div>
        {label && <p className="text-xs font-semibold text-muted-foreground">{label}</p>}
        <p className={cn("text-sm font-bold", over ? "text-destructive" : "text-success")}>
          {sign}
          {varianceHours.toFixed(0)} hr · {sign}
          {formatCurrency(varianceCost)}
        </p>
      </div>
      {variancePct != null && (
        <span className={cn("text-sm font-extrabold", over ? "text-destructive" : "text-success")}>
          {sign}
          {variancePct.toFixed(0)}% {over ? "over" : "under"}
        </span>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

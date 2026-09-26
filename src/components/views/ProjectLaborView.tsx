import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { KpiCard } from "@/components/common/KpiCard";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  getProject,
  listCategories,
  listEmployees,
  getBusinessProfile,
  listMaterials,
  listLaborEntries,
  createLaborEntry,
  deleteLaborEntry,
  logProjectEvent,
} from "@/lib/api";
import { laborRollupsByScope, laborTotals, plannedLaborFromSections, productivityMetrics, GENERAL_SCOPE_KEY, type ScopeLaborRollup } from "@/lib/laborPlan";
import { BackLink } from "@/components/common/BackLink";

const CUSTOM_WORKER = "__custom__";

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ProjectLaborView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  // Planned labor = the Cost plan sections' labor blocks.
  const { data: costPlanSections = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: actualEntries = [] } = useQuery({
    queryKey: ["labor-entries", { project: id }],
    queryFn: () => listLaborEntries(id),
  });

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

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

  const rollups = laborRollupsByScope(plannedLaborFromSections(costPlanSections), actualEntries, categories);
  const totals = laborTotals(rollups);
  const productivity = productivityMetrics(project?.size_sqft, totals);

  return (
    <div className="animate-fade-in max-w-4xl space-y-6 pb-40 md:pb-24">
      <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Back to project</BackLink>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Labor log</h1>
        <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Planned labor comes from each section&apos;s labor block in the{" "}
          <Link to={`/projects/${id}/materials`} className="font-semibold text-primary hover:underline">
            cost plan
          </Link>
          .
        </p>
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

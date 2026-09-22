import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn, formatCurrency } from "@/lib/utils";
import {
  getProject,
  listQuotes,
  listChangeOrders,
  listMaterials,
  listMaterialOrders,
  listUsageLogsForItems,
  listCostPlanItems,
  createCostPlanItem,
  deleteCostPlanItem,
  listLaborPlanEntries,
  listLaborEntries,
  listCategories,
  type CostPlanGroup,
  type CostPlanItem,
  type MaterialsItem,
} from "@/lib/api";
import { trackedSheetIds, projectTracksMaterials, sheetCostSummary, predictedMaterialCost, type DeliveryLineWithOrderStatus } from "@/lib/materialTracking";
import { costPlanSummary, costPlanGroupItems, COST_PLAN_GROUPS, COST_PLAN_GROUP_LABELS } from "@/lib/costPlan";
import { laborRollupsByScope, laborTotals } from "@/lib/laborPlan";

export function ProjectCostPlanView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: id }],
    queryFn: () => listChangeOrders(id),
  });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: materialOrders = [] } = useQuery({
    queryKey: ["material-orders", { project: id }],
    queryFn: () => listMaterialOrders(id),
  });
  const { data: costPlanItems = [] } = useQuery({
    queryKey: ["cost-plan-items", { project: id }],
    queryFn: () => listCostPlanItems(id),
  });
  const { data: laborPlanEntries = [] } = useQuery({
    queryKey: ["labor-plan-entries", { project: id }],
    queryFn: () => listLaborPlanEntries(id),
  });
  const { data: laborEntries = [] } = useQuery({
    queryKey: ["labor-entries", { project: id }],
    queryFn: () => listLaborEntries(id),
  });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  // Same tracked-sheet/baseline computation as ProjectDetailView, so the
  // materials figure here can never disagree with the project page's own
  // Profit Summary — see predictedMaterialCost()'s doc comment.
  const trackedIds = project && projectTracksMaterials(project.status) ? trackedSheetIds(quotes, changeOrders) : new Set<string>();
  const trackedLines: MaterialsItem[] = materials.filter((s) => trackedIds.has(s.sheet_id)).flatMap((s) => s.materials_items);
  const trackedLineIds = trackedLines.map((l) => l.id);
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", trackedLineIds],
    queryFn: () => listUsageLogsForItems(trackedLineIds),
    enabled: trackedLineIds.length > 0,
  });
  const deliveries: DeliveryLineWithOrderStatus[] = materialOrders.flatMap((o) =>
    o.material_order_items.map((item) => ({ item, orderStatus: o.status })),
  );
  const materialCostSummary = trackedLines.length > 0 ? sheetCostSummary(trackedLines, deliveries, usageLogs) : null;
  const materialCost = predictedMaterialCost(materials, materialCostSummary);

  const laborRollups = laborRollupsByScope(laborPlanEntries, laborEntries, categories);
  const { plannedCost: laborPlannedCost, plannedHours: laborPlannedHours } = laborTotals(laborRollups);

  const summary = costPlanSummary(quotes, changeOrders, materialCost, laborPlannedCost, costPlanItems);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cost-plan-items", { project: id }] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: (input: { group: CostPlanGroup; name: string; planned_cost: number }) =>
      createCostPlanItem({ project_id: id, ...input }),
    onSuccess: invalidate,
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: (itemId: string) => deleteCostPlanItem(itemId),
    onSuccess: invalidate,
    onError,
  });

  return (
    <div className="animate-fade-in max-w-4xl space-y-6">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Cost Plan</h1>
        <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Contract value" value={summary.contractValue > 0 ? formatCurrency(summary.contractValue) : "—"} />
        <KpiCard label="Total planned cost" value={formatCurrency(summary.totalPlannedCost)} />
        <KpiCard
          label="Projected profit"
          value={summary.projectedProfit != null ? formatCurrency(summary.projectedProfit) : "—"}
          subTone={summary.projectedProfit != null ? (summary.projectedProfit >= 0 ? "positive" : "negative") : "muted"}
        />
        <KpiCard
          label="Projected margin"
          value={summary.projectedMarginPct != null ? `${summary.projectedMarginPct.toFixed(0)}%` : "—"}
          subTone={summary.projectedMarginPct != null ? (summary.projectedMarginPct >= 0 ? "positive" : "negative") : "muted"}
        />
      </div>

      <div className="space-y-3">
        {/* Materials — computed, never re-entered. */}
        <div className="card-surface flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Materials</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {materialCost != null ? "From the Materials Sheet — nothing to re-enter here." : "No materials sheet started yet."}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-extrabold tabular-nums text-foreground">{materialCost != null ? formatCurrency(materialCost) : "—"}</p>
            <button
              className="text-xs font-semibold text-primary"
              onClick={() => navigate(`/projects/${id}/materials`)}
            >
              {materialCost != null ? "View Material Plan" : "Add materials"}
            </button>
          </div>
        </div>

        {/* Labor — computed, never re-entered. */}
        <div className="card-surface flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Labor</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {laborPlannedHours > 0
                ? `${laborPlannedHours.toFixed(0)} planned hours — from the Labor Plan.`
                : "No labor plan started yet."}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-extrabold tabular-nums text-foreground">{formatCurrency(laborPlannedCost)}</p>
            <button className="text-xs font-semibold text-primary" onClick={() => navigate(`/projects/${id}/labor`)}>
              {laborPlannedHours > 0 ? "View Labor Plan" : "Set up labor plan"}
            </button>
          </div>
        </div>

        {COST_PLAN_GROUPS.map((group) => (
          <CostPlanGroupSection
            key={group}
            group={group}
            items={costPlanGroupItems(costPlanItems, group)}
            onAdd={(name, cost) => addMut.mutate({ group, name, planned_cost: cost })}
            onDelete={(itemId) => deleteMut.mutate(itemId)}
            saving={addMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function CostPlanGroupSection({
  group,
  items,
  onAdd,
  onDelete,
  saving,
}: {
  group: CostPlanGroup;
  items: CostPlanItem[];
  onAdd: (name: string, cost: number) => void;
  onDelete: (itemId: string) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const total = items.reduce((s, i) => s + Number(i.planned_cost), 0);

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(cost) || 0);
    setName("");
    setCost("");
  };

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">{COST_PLAN_GROUP_LABELS[group]}</h3>
        <p className="text-base font-extrabold tabular-nums text-foreground">{formatCurrency(total)}</p>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
            <span className="min-w-0 truncate text-[13px] text-foreground">{item.name}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-bold tabular-nums text-foreground">{formatCurrency(Number(item.planned_cost))}</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${item.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete(item.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned yet.</p>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${group === "subcontractor" ? "Excavation sub" : group === "equipment" ? "Skid steer rental" : "Permit fees"}`}
          className="h-9 min-w-0 flex-1"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="relative w-28 shrink-0">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="h-9 pl-5"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <Button size="sm" variant="outline" disabled={!name.trim() || saving} onClick={submit} className={cn("shrink-0")}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

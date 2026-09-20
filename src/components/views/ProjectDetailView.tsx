import { useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { projectDurationStatus, scheduledWindowWorkingDays } from "@/lib/projectDuration";
import {
  getProject,
  listQuotes,
  listInvoices,
  listMaterials,
  listMaterialsSheets,
  listExpenses,
  listChangeOrders,
  listMaterialOrders,
  listProjectEvents,
  quoteTotal,
  logProjectEvent,
  updateProject,
  pickHeadlineQuote,
  projectContractValue,
  approvedChangeOrderTotal,
  materialsCogs,
  listProjectNotes,
  deleteProjectNote,
  type ProjectStatus,
} from "@/lib/api";
import {
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
  projectStatusMeta,
  quoteStatusMeta,
} from "@/lib/statusMeta";
import { demoJobMeta } from "@/lib/demoData";

const expenseDate = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [estimateDraft, setEstimateDraft] = useState("");

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: materialsSheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: id }],
    queryFn: () => listMaterialsSheets(id),
  });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: id }], queryFn: () => listExpenses(id) });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: id }],
    queryFn: () => listChangeOrders(id),
  });
  const { data: materialOrders = [] } = useQuery({
    queryKey: ["material-orders", { project: id }],
    queryFn: () => listMaterialOrders(id),
  });
  const { data: events = [] } = useQuery({ queryKey: ["project-events", id], queryFn: () => listProjectEvents(id) });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      void logProjectEvent(id, "status_changed", `Status → ${projectStatusMeta(status).label}`);
      qc.invalidateQueries({ queryKey: ["project-events", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  const scheduleMutation = useMutation({
    mutationFn: (patch: { scheduled_start_date?: string | null; scheduled_end_date?: string | null }) =>
      updateProject(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update schedule", description: err.message, variant: "destructive" }),
  });

  const durationMutation = useMutation({
    mutationFn: (patch: {
      estimated_duration_days?: number | null;
      actual_start_date?: string | null;
      actual_end_date?: string | null;
    }) => updateProject(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update estimated duration", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const headlineQuote = pickHeadlineQuote(quotes);
  const contract = projectContractValue(quotes, changeOrders);
  const invoicedTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const leftToBill = Math.max(0, contract - invoicedTotal);

  const totalMaterialsItems = materials.reduce((n, s) => n + s.materials_items.length, 0);
  const predictedCost = totalMaterialsItems > 0 ? materialsCogs(materials) : null;
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const actualCost = expenses.length > 0 ? expensesTotal : null;
  const realCost = actualCost ?? predictedCost;
  const marginPct = contract > 0 && realCost != null ? Math.round(((contract - realCost) / contract) * 100) : null;
  const marginProfit = realCost != null ? contract - realCost : null;

  const durationStatus = projectDurationStatus(project);
  const scheduledWindowDays = scheduledWindowWorkingDays(project);
  const windowNote =
    project.estimated_duration_days &&
    scheduledWindowDays != null &&
    project.estimated_duration_days > scheduledWindowDays
      ? `Estimate exceeds scheduled window by ${pluralize(project.estimated_duration_days - scheduledWindowDays, "day")}`
      : null;

  const meta = projectStatusMeta(project.status);
  const demo = demoJobMeta(project);
  const recentExpenses = [...expenses]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const materialsSummary =
    materials.length === 0
      ? "Not started"
      : materialsSheets.length > 1
        ? `${pluralize(materialsSheets.length, "sheet")} · ${formatCurrency(materialsCogs(materials))} cost`
        : `${pluralize(materials.length, "section")} · ${formatCurrency(materialsCogs(materials))} cost`;
  const quotesSummary =
    quotes.length === 0
      ? "Not started"
      : `${pluralize(quotes.length, "quote")}${headlineQuote ? ` · ${quoteStatusMeta(headlineQuote.status).label} · ${formatCurrency(quoteTotal(headlineQuote.quote_sections))}` : ""}`;
  const invoicesSummary =
    invoices.length === 0
      ? "None yet"
      : `${pluralize(invoices.length, "invoice")} · ${formatCurrency(invoicedTotal)}`;
  const expensesSummary =
    expenses.length === 0
      ? "None yet"
      : `${pluralize(expenses.length, "expense")} · ${formatCurrency(expensesTotal)}`;
  const approvedCOTotal = approvedChangeOrderTotal(changeOrders);
  const pendingCOCount = changeOrders.filter((co) => co.status === "pending").length;
  const changeOrdersSummary =
    changeOrders.length === 0
      ? "None yet"
      : `${approvedCOTotal > 0 ? "+" : ""}${formatCurrency(approvedCOTotal)} approved${pendingCOCount ? ` · ${pendingCOCount} pending` : ""}`;
  const pendingDeliveryCount = materialOrders.filter((mo) => mo.status !== "delivered").length;
  const materialOrdersSummary =
    materialOrders.length === 0 ? "None yet" : `${pluralize(materialOrders.length, "order")} · ${pendingDeliveryCount} pending`;

  const statusSelect = (
    <Select value={project.status} onValueChange={(v) => statusMutation.mutate(v as ProjectStatus)}>
      <SelectTrigger className="h-9 w-40 rounded-[0.625rem] border-border bg-card text-sm font-semibold">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{PROJECT_STATUS_META[s].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title={project.name}
        subtitle={`${project.client?.name ?? "No client"} · ${demo.crew}`}
        back={{ to: "/projects", label: "Projects" }}
        pills={<StatusPill meta={meta} className="!bg-white/20 !text-sidebar-foreground" />}
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <Link to="/projects" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">{project.name}</h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.client?.name ?? "No client"} · {demo.crew}
            </p>
          </div>
          {statusSelect}
        </div>
      </div>
      <div className="md:hidden">{statusSelect}</div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Section nav */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HubCard title="Materials sheet" summary={materialsSummary} onOpen={() => navigate(`/projects/${id}/materials`)} />
            <HubCard title="Quotes" summary={quotesSummary} onOpen={() => navigate(`/projects/${id}/quotes`)} />
            <HubCard title="Invoices" summary={invoicesSummary} onOpen={() => navigate(`/projects/${id}/invoices`)} />
            <HubCard title="Expenses" summary={expensesSummary} onOpen={() => navigate(`/projects/${id}/expenses`)} />
            <HubCard
              title="Change orders"
              summary={changeOrdersSummary}
              onOpen={() => navigate(`/projects/${id}/change-orders`)}
            />
            <HubCard
              title="Material orders"
              summary={materialOrdersSummary}
              onOpen={() => navigate(`/projects/${id}/material-orders`)}
            />
          </div>

          {/* Profit summary (real) */}
          <ProfitSummaryCard
            quoted={contract || null}
            predictedCost={predictedCost}
            actualCost={actualCost}
          />

          {/* Costs to date — real logged expenses only */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Costs to date</h3>
              <Link
                to={`/projects/${id}/expenses`}
                className="text-[13px] font-semibold text-primary"
              >
                {expenses.length ? "Manage" : "Add expense"}
              </Link>
            </div>
            <p className="mt-1 text-[28px] font-extrabold tracking-tight tabular-nums text-foreground">
              {formatCurrency(expensesTotal)}
            </p>
            {expenses.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No expenses logged yet.</p>
            ) : (
              <div className="mt-3">
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {e.name || "Expense"}
                      {e.date && <span className="text-muted-subtle"> · {expenseDate(e.date)}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </div>
                ))}
                {expenses.length > recentExpenses.length && (
                  <p className="pt-2 text-xs font-semibold text-muted-foreground">
                    +{expenses.length - recentExpenses.length} more
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Money</h3>
            <div className="mt-2">
              <MoneyRow label="Contract" value={contract > 0 ? formatCurrency(contract) : "—"} />
              <MoneyRow label="Invoiced" value={formatCurrency(invoicedTotal)} />
              <MoneyRow label="Paid" value={formatCurrency(paidTotal)} />
              <MoneyRow label="Left to bill" value={formatCurrency(leftToBill)} strong />
            </div>
            {marginProfit != null && (
              <div className="mt-3 rounded-xl bg-primary/10 p-3">
                <div className="text-xs font-semibold text-success">
                  {actualCost != null ? "Actual" : "Projected"} margin
                </div>
                <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-foreground">
                  {marginPct}% <span className="text-sm font-bold text-muted-foreground">· {formatCurrency(marginProfit)}</span>
                </div>
              </div>
            )}
          </section>

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Schedule</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-start" className="text-xs font-semibold text-muted-foreground">
                  Start date
                </Label>
                <Input
                  id="scheduled-start"
                  type="date"
                  value={project.scheduled_start_date ?? ""}
                  onChange={(e) =>
                    scheduleMutation.mutate({ scheduled_start_date: e.target.value || null })
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-end" className="text-xs font-semibold text-muted-foreground">
                  End date
                </Label>
                <Input
                  id="scheduled-end"
                  type="date"
                  min={project.scheduled_start_date ?? undefined}
                  value={project.scheduled_end_date ?? ""}
                  onChange={(e) =>
                    scheduleMutation.mutate({ scheduled_end_date: e.target.value || null })
                  }
                  className="h-10"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-subtle">
              Feeds the Dashboard Seasonal Backlog card and the Backlog Schedule calendar once this job is
              approved.
            </p>
          </section>

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Estimated duration</h3>

            {project.estimated_duration_days == null ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">No estimate set</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Days"
                    value={estimateDraft}
                    onChange={(e) => setEstimateDraft(e.target.value)}
                    className="h-9 w-20"
                    aria-label="Estimated crew days"
                  />
                  <Button
                    size="sm"
                    disabled={!estimateDraft || Number(estimateDraft) <= 0 || durationMutation.isPending}
                    onClick={() => {
                      const days = parseInt(estimateDraft, 10);
                      if (days > 0) {
                        durationMutation.mutate({ estimated_duration_days: days });
                        setEstimateDraft("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={project.estimated_duration_days}
                    onChange={(e) => {
                      const days = e.target.value ? parseInt(e.target.value, 10) : null;
                      durationMutation.mutate({ estimated_duration_days: days && days > 0 ? days : null });
                    }}
                    className="h-10 w-20"
                    aria-label="Estimated crew days"
                  />
                  <span className="text-sm text-muted-foreground">crew days estimated</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="actual-start" className="text-xs font-semibold text-muted-foreground">
                      Actual start
                    </Label>
                    <Input
                      id="actual-start"
                      type="date"
                      value={project.actual_start_date ?? ""}
                      onChange={(e) =>
                        durationMutation.mutate({ actual_start_date: e.target.value || null })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="actual-end" className="text-xs font-semibold text-muted-foreground">
                      Actual end
                    </Label>
                    <Input
                      id="actual-end"
                      type="date"
                      min={project.actual_start_date ?? undefined}
                      value={project.actual_end_date ?? ""}
                      onChange={(e) =>
                        durationMutation.mutate({ actual_end_date: e.target.value || null })
                      }
                      className="h-10"
                    />
                  </div>
                </div>

                {(durationStatus.state === "in_progress" || durationStatus.state === "complete") && (
                  <div className="mt-3">
                    {(() => {
                      const isOver =
                        (durationStatus.state === "in_progress" && durationStatus.overDays > 0) ||
                        (durationStatus.state === "complete" && durationStatus.diffDays > 0);
                      const label =
                        durationStatus.state === "in_progress"
                          ? `Day ${durationStatus.elapsedDays} of ${durationStatus.estimateDays}${
                              durationStatus.overDays > 0
                                ? ` · ${pluralize(durationStatus.overDays, "day")} over`
                                : ""
                            }`
                          : `Took ${pluralize(durationStatus.totalDays, "day")} · ${
                              durationStatus.diffDays > 0
                                ? `${pluralize(durationStatus.diffDays, "day")} over estimate`
                                : durationStatus.diffDays < 0
                                  ? `finished ${pluralize(-durationStatus.diffDays, "day")} early`
                                  : "right on estimate"
                            }`;
                      const progressPct = Math.min(
                        100,
                        ((durationStatus.state === "in_progress"
                          ? durationStatus.elapsedDays
                          : durationStatus.totalDays) /
                          durationStatus.estimateDays) *
                          100,
                      );
                      return (
                        <>
                          <p className={cn("text-sm font-semibold", isOver ? "text-destructive" : "text-foreground")}>
                            {label}
                          </p>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isOver ? "bg-destructive" : "bg-primary",
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {windowNote && <p className="mt-3 text-[11px] text-warning">{windowNote}</p>}
              </>
            )}
          </section>

          {project.client && (
            <section
              role="button"
              tabIndex={0}
              onClick={() => project.client_id && navigate(`/clients/${project.client_id}/edit`)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && project.client_id) {
                  e.preventDefault();
                  navigate(`/clients/${project.client_id}/edit`);
                }
              }}
              className="card-surface group w-full cursor-pointer p-5 text-left transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Client</h3>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold text-foreground">{project.client.name}</p>
              <div className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
                {project.client.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{project.client.address}</span>
                  </p>
                )}
                {project.client.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`tel:${project.client.phone}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.phone}
                    </a>
                  </p>
                )}
                {project.client.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`mailto:${project.client.email}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.email}
                    </a>
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Activity</h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                      {timeAgo(e.created_at)}
                    </div>
                    <div className="mt-0.5 text-[13px] text-foreground/80">{e.summary}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <PhotoGallery
        owner={{ type: "project", id }}
        title="Project Images"
        emptyText="No photos yet — add progress photos, before/after, or site conditions."
      />
      <FieldUpdatesCard projectId={id} />
    </div>
  );
}

function profitColor(v: number): string {
  return v >= 0 ? "text-success" : "text-destructive";
}

function ProfitSummaryCard({
  quoted,
  predictedCost,
  actualCost,
}: {
  quoted: number | null;
  predictedCost: number | null;
  actualCost: number | null;
}) {
  const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
  const predictedProfit = quoted !== null && predictedCost !== null ? quoted - predictedCost : null;
  const actualProfit = quoted !== null && actualCost !== null ? quoted - actualCost : null;
  const predictedMargin = predictedProfit !== null && quoted ? (predictedProfit / quoted) * 100 : null;
  const actualMargin = actualProfit !== null && quoted ? (actualProfit / quoted) * 100 : null;

  return (
    <section className="card-surface space-y-4 p-5">
      <h3 className="text-base font-bold text-foreground">Profit summary</h3>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Metric label="Quoted" value={money(quoted)} />
        <Metric label="Predicted cost" value={money(predictedCost)} />
        <Metric label="Actual cost" value={money(actualCost)} />
      </div>
      {(predictedProfit !== null || actualProfit !== null) && (
        <div className="grid grid-cols-1 gap-4 border-t border-hairline pt-3 sm:grid-cols-2">
          {predictedProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Predicted profit</p>
              <p className={cn("text-lg font-extrabold", profitColor(predictedProfit))}>
                {formatCurrency(predictedProfit)}
                {predictedMargin !== null && <span className="ml-1.5 text-sm font-bold">({predictedMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
          {actualProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Actual profit</p>
              <p className={cn("text-lg font-extrabold", profitColor(actualProfit))}>
                {formatCurrency(actualProfit)}
                {actualMargin !== null && <span className="ml-1.5 text-sm font-bold">({actualMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}

function HubCard({ title, summary, onOpen }: { title: string; summary: ReactNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface group flex items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * Free-text updates employees (0043) posted from the field — read-only
 * from the owner's side (an employee's own project screen is where they
 * get written), with a delete affordance since the owner's "own"
 * project_notes policy already permits it. Employee-uploaded photos need
 * no equivalent card here — they land in the exact same project_images
 * table/query the PhotoGallery above already reads, regardless of who
 * uploaded them.
 */
function FieldUpdatesCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["project-notes", projectId],
    queryFn: () => listProjectNotes(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProjectNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-notes", projectId] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (!isLoading && notes.length === 0) return null;

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Field updates</h3>
        {notes.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(notes.length, "update")}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{n.employee_name ?? "Team update"}</span>
                  <span className="text-[11px] text-muted-subtle">{timeAgo(n.created_at)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/80">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteMut.mutate(n.id)}
                className="shrink-0 text-muted-subtle transition-colors hover:text-destructive"
                aria-label="Delete update"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

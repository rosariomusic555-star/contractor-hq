import type { ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  getProject,
  listQuotes,
  listInvoices,
  listMaterials,
  listExpenses,
  updateProject,
  quoteTotal,
  pickHeadlineQuote,
  materialsCogs,
  type ProjectStatus,
} from "@/lib/api";
import {
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
  projectStatusMeta,
  quoteStatusMeta,
} from "@/lib/statusMeta";
import { demoJobActivity, demoJobCostSplit, demoJobMeta, demoJobWeek } from "@/lib/demoData";

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: id }], queryFn: () => listExpenses(id) });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const headlineQuote = pickHeadlineQuote(quotes);
  const contract = headlineQuote ? quoteTotal(headlineQuote.quote_sections) : 0;
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

  const meta = projectStatusMeta(project.status);
  const demo = demoJobMeta(project);
  const week = demoJobWeek(project);
  const costSplit = demoJobCostSplit(project, materialsCogs(materials));
  const activity = demoJobActivity(project);

  const materialsSummary =
    materials.length === 0
      ? "Not started"
      : `${pluralize(materials.length, "section")} · ${formatCurrency(materialsCogs(materials))} cost`;
  const quotesSummary =
    quotes.length === 0
      ? "Not started"
      : `${pluralize(quotes.length, "quote")}${headlineQuote ? ` · ${quoteStatusMeta(headlineQuote.status).label} · ${formatCurrency(contract)}` : ""}`;
  const invoicesSummary =
    invoices.length === 0
      ? "None yet"
      : `${pluralize(invoices.length, "invoice")} · ${formatCurrency(invoicedTotal)}`;
  const expensesSummary =
    expenses.length === 0
      ? "None yet"
      : `${pluralize(expenses.length, "expense")} · ${formatCurrency(expensesTotal)}`;

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
          {/* Schedule strip (demo) */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Schedule</h3>
              <span className="text-xs font-semibold text-muted-foreground">
                {demo.dayOfTotal ? `Day ${demo.dayOfTotal.day} of ${demo.dayOfTotal.total} · ${demo.crew}` : demo.crew}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${demo.progressPct}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {week.map((d) => (
                <div
                  key={d.day}
                  className={cn(
                    "rounded-xl border p-2.5",
                    d.state === "today" ? "border-primary bg-primary/10" : "border-border bg-card",
                  )}
                >
                  <div
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-wide",
                      d.state === "done" ? "text-success" : d.state === "today" ? "text-foreground" : "text-muted-subtle",
                    )}
                  >
                    {d.day} {d.state === "done" ? "✓" : ""}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-foreground/80">{d.task}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Profit summary (real) */}
          <ProfitSummaryCard
            quoted={contract || null}
            predictedCost={predictedCost}
            actualCost={actualCost}
          />

          {/* Costs to date (materials real, rest demo) */}
          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Costs to date</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Materials", value: costSplit.materials, note: materials.length ? "from sheet" : "no sheet yet" },
                { label: "Labor", value: costSplit.labor, note: "est." },
                { label: "Equipment", value: costSplit.equipment, note: "est." },
                { label: "Disposal", value: costSplit.disposal, note: "est." },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{c.label}</div>
                  <div className="mt-1 text-lg font-extrabold tabular-nums text-foreground">{formatCurrency(c.value)}</div>
                  <div className="mt-0.5 text-[11px] text-muted-subtle">{c.note}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Section nav */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HubCard title="Materials sheet" summary={materialsSummary} onOpen={() => navigate(`/projects/${id}/materials`)} />
            <HubCard title="Quotes" summary={quotesSummary} onOpen={() => navigate(`/projects/${id}/quotes`)} />
            <HubCard title="Invoices" summary={invoicesSummary} onOpen={() => navigate(`/projects/${id}/invoices`)} />
            <HubCard title="Expenses" summary={expensesSummary} onOpen={() => navigate(`/projects/${id}/expenses`)} />
          </div>
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

          {project.client && (
            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Client</h3>
              <p className="mt-2 text-sm font-bold text-foreground">{project.client.name}</p>
            </section>
          )}

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Activity</h3>
            <ul className="mt-3 space-y-3">
              {activity.map((a) => (
                <li key={a.when}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{a.when}</div>
                  <div className="mt-0.5 text-[13px] text-foreground/80">{a.text}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
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

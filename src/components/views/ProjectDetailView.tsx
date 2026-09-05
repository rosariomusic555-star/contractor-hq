import type { ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
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
  type QuoteStatus,
} from "@/lib/api";
import { PROJECT_STATUS_META, PROJECT_STATUSES, projectStatusMeta } from "@/lib/projectStatus";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
};

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: id }],
    queryFn: () => listQuotes(id),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", { project: id }],
    queryFn: () => listInvoices(id),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", { project: id }],
    queryFn: () => listExpenses(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const materialsSummary =
    materials.length === 0
      ? "Not started"
      : `${plural(materials.length, "section")} · ${formatCurrency(materialsCogs(materials))} total cost`;

  // Quotes card + Profit Summary both key off the same "headline" quote
  // (most recently approved, else sent, else draft) so they always agree.
  const headlineQuote = pickHeadlineQuote(quotes);
  const quotesSummary =
    quotes.length === 0 ? (
      "Not started"
    ) : (
      <>
        {plural(quotes.length, "quote")}
        {headlineQuote && (
          <>
            {" · "}
            {quoteStatusLabel[headlineQuote.status]} ·{" "}
            {formatCurrency(quoteTotal(headlineQuote.quote_sections))}
          </>
        )}
      </>
    );

  const invoicesTotal = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const outstandingCount = invoices.filter((i) => i.status === "sent").length;
  const invoicesSummary: ReactNode =
    invoices.length === 0 ? (
      "None yet"
    ) : (
      <>
        {plural(invoices.length, "invoice")} · {formatCurrency(invoicesTotal)} total
        {outstandingCount > 0 && (
          <>
            <br />
            {outstandingCount} outstanding
          </>
        )}
      </>
    );

  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const expensesSummary =
    expenses.length === 0
      ? "None yet"
      : `${plural(expenses.length, "expense")} · ${formatCurrency(expensesTotal)} total`;

  const meta = projectStatusMeta(project.status);

  const totalMaterialsItems = materials.reduce((n, s) => n + s.materials_items.length, 0);

  const quotedAmount = headlineQuote ? quoteTotal(headlineQuote.quote_sections) : null;
  const predictedCost = totalMaterialsItems > 0 ? materialsCogs(materials) : null;
  const actualCost = expenses.length > 0 ? expensesTotal : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Projects
      </Link>

      <div className="space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{project.client?.name ?? "No client"}</span>
          <span className={meta.badge}>{meta.label}</span>
          <Select
            value={project.status}
            onValueChange={(v) => statusMutation.mutate(v as ProjectStatus)}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ProfitSummaryCard quoted={quotedAmount} predictedCost={predictedCost} actualCost={actualCost} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HubCard
          title="Materials sheet"
          summary={materialsSummary}
          onOpen={() => navigate(`/projects/${id}/materials`)}
        />
        <HubCard
          title="Quotes"
          summary={quotesSummary}
          onOpen={() => navigate(`/projects/${id}/quotes`)}
        />
        <HubCard
          title="Invoices"
          summary={invoicesSummary}
          onOpen={() => navigate(`/projects/${id}/invoices`)}
        />
        <HubCard
          title="Expenses"
          summary={expensesSummary}
          onOpen={() => navigate(`/projects/${id}/expenses`)}
        />
      </div>
    </div>
  );
}

function money(v: number | null): string {
  return v === null ? "—" : formatCurrency(v);
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
  const predictedProfit = quoted !== null && predictedCost !== null ? quoted - predictedCost : null;
  const actualProfit = quoted !== null && actualCost !== null ? quoted - actualCost : null;
  // Margin is undefined at a $0 quote — leave it off rather than show ±Infinity/NaN.
  const predictedMargin =
    predictedProfit !== null && quoted ? (predictedProfit / quoted) * 100 : null;
  const actualMargin = actualProfit !== null && quoted ? (actualProfit / quoted) * 100 : null;

  return (
    <div className="stat-card space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Profit Summary</h2>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Quoted</p>
          <p className="font-semibold text-foreground">{money(quoted)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Predicted cost</p>
          <p className="font-semibold text-foreground">{money(predictedCost)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Actual cost</p>
          <p className="font-semibold text-foreground">{money(actualCost)}</p>
        </div>
      </div>

      {(predictedProfit !== null || actualProfit !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
          {predictedProfit !== null && (
            <div>
              <p className="text-muted-foreground text-sm">Predicted profit</p>
              <p className={cn("text-lg font-bold", profitColor(predictedProfit))}>
                {formatCurrency(predictedProfit)}
                {predictedMargin !== null && (
                  <span className="text-sm font-medium ml-1.5">({predictedMargin.toFixed(0)}%)</span>
                )}
              </p>
            </div>
          )}
          {actualProfit !== null && (
            <div>
              <p className="text-muted-foreground text-sm">Actual profit</p>
              <p className={cn("text-lg font-bold", profitColor(actualProfit))}>
                {formatCurrency(actualProfit)}
                {actualMargin !== null && (
                  <span className="text-sm font-medium ml-1.5">({actualMargin.toFixed(0)}%)</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HubCard({
  title,
  summary,
  onOpen,
}: {
  title: string;
  summary: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="stat-card flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground flex-1">{summary}</p>
      <Button variant="outline" size="sm" className="self-start" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

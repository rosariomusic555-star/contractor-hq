import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getProject,
  listInvoices,
  listQuotes,
  listChangeOrders,
  createInvoice,
  logProjectEvent,
  pickHeadlineQuote,
  projectContractValue,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";

// Append a local midnight so a date-only string ("2026-09-15") isn't parsed
// as UTC midnight, which shifts it back a day in negative-offset timezones.
const formatDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No due date";

export function ProjectInvoicesView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: invoices = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["invoices", { project: id }],
    queryFn: () => listInvoices(id),
  });

  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  // New invoice defaults to the remaining balance on the project's quote
  // (quote total minus what's already been paid) — the contractor can
  // override it on the detail page.
  const createMut = useMutation({
    mutationFn: async () => {
      const [quotes, changeOrders] = await Promise.all([listQuotes(id), listChangeOrders(id)]);
      const headline = pickHeadlineQuote(quotes);
      const contract = projectContractValue(quotes, changeOrders);
      const paidSum = invoices
        .filter((i) => i.status === "paid")
        .reduce((sum, i) => sum + Number(i.amount), 0);
      const amount = Math.round(Math.max(0, contract - paidSum) * 100) / 100;
      return createInvoice({ project_id: id, amount, quote_id: headline?.id ?? null });
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["invoices", { project: id }] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      void logProjectEvent(
        id,
        "invoice_created",
        `${invoice.invoice_number ?? "Invoice"} drafted · ${formatCurrency(Number(invoice.amount))}`,
        { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
      );
      qc.invalidateQueries({ queryKey: ["project-events", id] });
      navigate(`/projects/${id}/invoices/${invoice.id}`);
    },
    onError,
  });

  // Ascending by creation order so the displayed numbers (INV-001, …) are stable.
  const sorted = [...invoices].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (isLoading) return <p className="text-muted-foreground">Loading invoices…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load invoices: {(error as Error)?.message}</p>;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          New invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No invoices yet. Create your first invoice.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((invoice) => (
            <Link
              key={invoice.id}
              to={`/projects/${id}/invoices/${invoice.id}`}
              className="card-surface flex flex-wrap items-center justify-between gap-3 p-5 transition-shadow hover:shadow-card-hover"
            >
              <div className="min-w-0">
                <p className="font-bold text-foreground">{invoice.invoice_number ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Due {formatDate(invoice.due_date)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold tabular-nums text-foreground">
                  {formatCurrency(Number(invoice.amount))}
                </span>
                <StatusPill meta={invoiceStatusMeta(invoice.status)} />
                <ChevronRight className="h-4 w-4 text-muted-subtle" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getProject,
  listInvoices,
  listQuotes,
  createInvoice,
  invoiceNumber,
  quoteTotal,
  type InvoiceStatus,
} from "@/lib/api";

const STATUS_META: Record<InvoiceStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "badge-status badge-draft" },
  sent: { label: "Sent", badge: "badge-status badge-info" },
  paid: { label: "Paid", badge: "badge-status badge-paid" },
  overdue: { label: "Overdue", badge: "badge-status badge-overdue" },
};

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
      const quotes = await listQuotes(id);
      const qTotal = quotes[0] ? quoteTotal(quotes[0].quote_sections) : 0;
      const paidSum = invoices
        .filter((i) => i.status === "paid")
        .reduce((sum, i) => sum + Number(i.amount), 0);
      const amount = Math.round(Math.max(0, qTotal - paidSum) * 100) / 100;
      return createInvoice({ project_id: id, amount });
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["invoices", { project: id }] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
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
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
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
          {sorted.map((invoice) => {
            const meta = STATUS_META[invoice.status];
            return (
              <div
                key={invoice.id}
                className="stat-card flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {invoiceNumber(invoices, invoice.id)}
                  </p>
                  <p className="text-sm text-muted-foreground">Due {formatDate(invoice.due_date)}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-semibold text-foreground">
                    {formatCurrency(Number(invoice.amount))}
                  </span>
                  <span className={meta.badge}>{meta.label}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/projects/${id}/invoices/${invoice.id}`)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

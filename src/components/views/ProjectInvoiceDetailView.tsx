import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getProject,
  getInvoice,
  listInvoices,
  updateInvoice,
  updateProject,
  generateShareLink,
  invoiceNumber,
  type InvoiceStatus,
} from "@/lib/api";

const STATUS_META: Record<InvoiceStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "badge-status badge-draft" },
  sent: { label: "Sent", badge: "badge-status badge-info" },
  paid: { label: "Paid", badge: "badge-status badge-paid" },
  overdue: { label: "Overdue", badge: "badge-status badge-overdue" },
};

export function ProjectInvoiceDetailView() {
  const { id = "", invoiceId = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: invoice,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ["invoice", invoiceId], queryFn: () => getInvoice(invoiceId) });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", { project: id }],
    queryFn: () => listInvoices(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    qc.invalidateQueries({ queryKey: ["invoices", { project: id }] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["projects", id] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const saveFieldMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateInvoice>[1]) => updateInvoice(invoiceId, patch),
    onSuccess: invalidate,
    onError,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const token = invoice!.share_token ?? (await generateShareLink("invoices", invoiceId));
      await updateInvoice(invoiceId, { status: "sent" });
      if (project && project.status !== "paid") {
        await updateProject(id, { status: "invoiced" });
      }
      return token;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Invoice sent" });
    },
    onError,
  });

  const markPaidMut = useMutation({
    mutationFn: async () => {
      await updateInvoice(invoiceId, { status: "paid", paid_at: new Date().toISOString() });
      const all = await listInvoices(id);
      const allPaid = all.every((i) => i.id === invoiceId || i.status === "paid");
      if (allPaid) await updateProject(id, { status: "paid" });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Invoice marked as paid" });
    },
    onError,
  });

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  if (isLoading || invoicesLoading) return <p className="text-muted-foreground">Loading invoice…</p>;
  if (isError || !invoice || !project)
    return <p className="text-destructive">Failed to load invoice: {(error as Error)?.message}</p>;

  const meta = STATUS_META[invoice.status];
  const number = invoiceNumber(
    invoices.some((i) => i.id === invoice.id) ? invoices : [invoice],
    invoice.id,
  );
  const persistedLink =
    invoice.share_token && invoice.status !== "draft"
      ? `${window.location.origin}/invoice/${invoice.share_token}`
      : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <Link
        to={`/projects/${id}/invoices`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to invoices
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Invoice {number}</h1>
        <span className={meta.badge}>{meta.label}</span>
      </div>

      {persistedLink && (
        <div className="stat-card flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Client link</p>
            <p className="font-mono text-sm truncate">{persistedLink}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyLink(persistedLink)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy link
          </Button>
        </div>
      )}

      <div className="stat-card space-y-5">
        <div className="space-y-2">
          <Label htmlFor="invoice-amount">Amount</Label>
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="invoice-amount"
              type="number"
              step="0.01"
              defaultValue={invoice.amount}
              className="pl-6"
              onBlur={(e) => saveFieldMut.mutate({ amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="invoice-due">Due date</Label>
          <Input
            id="invoice-due"
            type="date"
            defaultValue={invoice.due_date ?? ""}
            onBlur={(e) => saveFieldMut.mutate({ due_date: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-notes">Notes</Label>
          <Textarea
            id="invoice-notes"
            defaultValue={invoice.notes ?? ""}
            placeholder="Progress payment — foundation complete"
            onBlur={(e) => saveFieldMut.mutate({ notes: e.target.value || null })}
          />
        </div>
      </div>

      <div className="flex justify-end items-center gap-3">
        {invoice.status === "draft" && (
          <Button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {sendMut.isPending ? "Sending…" : "Send invoice"}
          </Button>
        )}
        {invoice.status === "sent" && (
          <Button
            onClick={() => markPaidMut.mutate()}
            disabled={markPaidMut.isPending}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {markPaidMut.isPending ? "Saving…" : "Mark as paid"}
          </Button>
        )}
        {invoice.status === "paid" && (
          <p className="text-sm text-muted-foreground">Paid — no further action needed.</p>
        )}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  listInvoices,
  updateInvoice,
  updateProject,
  generateShareLink,
  type Invoice,
  type ProjectStatus,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { invoiceDaysLate } from "@/lib/aging";
import { demoInvoiceHistory, demoInvoiceLineItems } from "@/lib/demoData";

interface InvoiceWorkspaceProps {
  invoice: Invoice;
  projectId: string | null;
  projectStatus: ProjectStatus | null;
  backHref: string;
  backLabel: string;
}

export function InvoiceWorkspace({
  invoice,
  projectId,
  projectStatus,
  backHref,
  backLabel,
}: InvoiceWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
    qc.invalidateQueries({ queryKey: ["invoices", { project: projectId }] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["projects", projectId] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const saveFieldMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateInvoice>[1]) => updateInvoice(invoice.id, patch),
    onSuccess: invalidate,
    onError,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const token = invoice.share_token ?? (await generateShareLink("invoices", invoice.id));
      await updateInvoice(invoice.id, { status: "sent" });
      if (projectId && projectStatus !== "paid") {
        await updateProject(projectId, { status: "invoiced" });
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
      await updateInvoice(invoice.id, { status: "paid", paid_at: new Date().toISOString() });
      if (projectId) {
        const all = await listInvoices(projectId);
        const allPaid = all.every((i) => i.id === invoice.id || i.status === "paid");
        if (allPaid) await updateProject(projectId, { status: "paid" });
      }
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

  const meta = invoiceStatusMeta(invoice.status);
  const number = invoice.invoice_number ?? "Invoice";
  const amount = Number(invoice.amount);
  const daysLate = invoiceDaysLate(invoice, new Date());
  const persistedLink =
    invoice.share_token && invoice.status !== "draft"
      ? `${window.location.origin}/invoice/${invoice.share_token}`
      : null;

  const lineItems = demoInvoiceLineItems(invoice);
  const history = demoInvoiceHistory(invoice);
  const clientName = invoice.project?.client?.name ?? null;

  const actionButton =
    invoice.status === "draft" ? (
      <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending} className="w-full font-bold">
        {sendMut.isPending ? "Sending…" : "Send invoice"}
      </Button>
    ) : invoice.status === "sent" ? (
      <Button onClick={() => markPaidMut.mutate()} disabled={markPaidMut.isPending} className="w-full font-bold">
        {markPaidMut.isPending ? "Saving…" : "Mark as paid"}
      </Button>
    ) : (
      <p className="text-center text-sm text-muted-foreground">Paid — no further action.</p>
    );

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title={number}
        subtitle={`${invoice.project?.name ?? "Standalone"}${clientName ? ` · ${clientName}` : ""}`}
        back={{ to: backHref, label: backLabel }}
        pills={
          <>
            {daysLate > 0 ? (
              <span className="badge-status !bg-white/20 !text-sidebar-foreground">{daysLate} days late</span>
            ) : (
              <StatusPill meta={meta} className="!bg-white/20 !text-sidebar-foreground" />
            )}
            {invoice.due_date && (
              <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">
                Due {invoice.due_date.slice(0, 10)}
              </span>
            )}
          </>
        }
      />

      <div className="hidden md:block">
        <Link to={backHref} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
        <div className="mt-2 flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">{number}</h1>
          {daysLate > 0 ? (
            <span className="badge-status badge-overdue">{daysLate} days late</span>
          ) : (
            <StatusPill meta={meta} />
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.project?.name ?? "Standalone"}
          {clientName ? ` · ${clientName}` : ""}
          {invoice.due_date ? ` · due ${invoice.due_date.slice(0, 10)}` : ""}
        </p>
      </div>

      {persistedLink && (
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">Client link</p>
            <p className="truncate font-mono text-sm">{persistedLink}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyLink(persistedLink)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy link
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Editable fields (real) */}
          <section className="card-surface space-y-5 p-5">
            <h3 className="text-base font-bold text-foreground">Details</h3>
            <div className="space-y-2">
              <Label htmlFor="invoice-amount">Amount</Label>
              <div className="relative max-w-xs">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
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
            <div className="max-w-xs space-y-2">
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
          </section>

          {/* Line-item preview (demo) */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Line items</h3>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-subtle">Preview</span>
            </div>
            <div className="mt-2">
              {lineItems.map((li, i) => (
                <MoneyRow key={i} label={li.label} value={formatCurrency(li.amount)} />
              ))}
              <MoneyRow label="Total" value={formatCurrency(amount)} strong />
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="card-surface p-5">
            <p className="text-[13px] font-semibold text-muted-foreground">Amount due</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
              {formatCurrency(invoice.status === "paid" ? 0 : amount)}
            </p>
            <p className="mt-1 text-xs text-muted-subtle">of {formatCurrency(amount)}</p>
            <div className="mt-4">{actionButton}</div>
          </section>

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">History</h3>
            <ul className="mt-3 space-y-3">
              {history.map((h) => (
                <li key={h.when}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{h.when}</div>
                  <div className="mt-0.5 text-[13px] text-foreground/80">{h.text}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

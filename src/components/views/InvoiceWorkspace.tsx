import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  getQuote,
  listInvoices,
  listQuotes,
  listProjectEvents,
  logProjectEvent,
  pickHeadlineQuote,
  quoteItemIncluded,
  quoteTotal,
  updateInvoice,
  updateProject,
  generateShareLink,
  type Invoice,
  type ProjectStatus,
  type Quote,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { invoiceDaysLate } from "@/lib/aging";

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

  // The quote this invoice bills against: its explicit quote_id, else the
  // project's headline quote.
  const { data: quote } = useQuery<Quote | null>({
    queryKey: ["invoice-source-quote", invoice.id, invoice.quote_id, projectId],
    queryFn: async () => {
      if (invoice.quote_id) return getQuote(invoice.quote_id);
      if (!projectId) return null;
      return pickHeadlineQuote(await listQuotes(projectId)) ?? null;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["project-events", projectId],
    queryFn: () => listProjectEvents(projectId!),
    enabled: !!projectId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
    qc.invalidateQueries({ queryKey: ["invoices", { project: projectId }] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["projects", projectId] });
    qc.invalidateQueries({ queryKey: ["project-events", projectId] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  // ---- draft: the Details form is edited locally, saved on "Save changes" ----
  const seedDraft = () => ({
    amount: String(invoice.amount),
    dueDate: invoice.due_date ?? "",
    notes: invoice.notes ?? "",
  });
  const [draft, setDraft] = useState(seedDraft);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seedDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);
  const editDraft = (patch: Partial<ReturnType<typeof seedDraft>>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const discard = () => {
    dirty.current = false;
    setDraft(seedDraft());
  };
  const isDirty = dirty.current;

  const saveMut = useMutation({
    mutationFn: () =>
      updateInvoice(invoice.id, {
        amount: parseFloat(draft.amount) || 0,
        due_date: draft.dueDate || null,
        notes: draft.notes.trim() || null,
      }),
    onSuccess: () => {
      dirty.current = false;
      invalidate();
      toast({ title: "Invoice saved" });
    },
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
      void logProjectEvent(projectId, "invoice_sent", `${number} sent · ${formatCurrency(amount)}`, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      });
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
      void logProjectEvent(
        projectId,
        "invoice_paid",
        `Payment received · ${number} · ${formatCurrency(amount)}`,
        { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
      );
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

  const quoteContract = quote ? quoteTotal(quote.quote_sections) : 0;
  const invoiceHistory = events.filter((e) => e.meta?.invoice_id === invoice.id);
  const clientName = invoice.project?.client?.name ?? null;

  const actionButton =
    invoice.status === "draft" ? (
      <>
        <Button
          onClick={() => sendMut.mutate()}
          disabled={sendMut.isPending || isDirty}
          className="w-full font-bold"
        >
          {sendMut.isPending ? "Sending…" : "Send invoice"}
        </Button>
        {isDirty && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Save your changes first.</p>
        )}
      </>
    ) : invoice.status === "sent" ? (
      <>
        <Button
          onClick={() => markPaidMut.mutate()}
          disabled={markPaidMut.isPending || isDirty}
          className="w-full font-bold"
        >
          {markPaidMut.isPending ? "Saving…" : "Mark as paid"}
        </Button>
        {isDirty && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Save your changes first.</p>
        )}
      </>
    ) : (
      <p className="text-center text-sm text-muted-foreground">Paid — no further action.</p>
    );

  return (
    <div className="animate-fade-in space-y-5 pb-40 md:pb-24">
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
          {/* Editable fields */}
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
                  inputMode="decimal"
                  value={draft.amount}
                  className="pl-6"
                  onChange={(e) => editDraft({ amount: e.target.value })}
                />
              </div>
            </div>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="invoice-due">Due date</Label>
              <Input
                id="invoice-due"
                type="date"
                value={draft.dueDate}
                onChange={(e) => editDraft({ dueDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-notes">Notes</Label>
              <Textarea
                id="invoice-notes"
                value={draft.notes}
                placeholder="Progress payment — foundation complete"
                onChange={(e) => editDraft({ notes: e.target.value })}
              />
            </div>
          </section>

          {/* Line items — from the linked quote */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Line items</h3>
              {quote?.project?.name && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-subtle">
                  From quote
                </span>
              )}
            </div>

            {!quote || quote.quote_sections.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No linked quote — this invoice isn't itemised.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {quote.quote_sections.map((section) => {
                  const items = section.quote_items.filter((i) => quoteItemIncluded(section, i));
                  if (items.length === 0) return null;
                  const subtotal = items.reduce((s, i) => s + Number(i.price), 0);
                  return (
                    <div key={section.id}>
                      <p className="text-[13px] font-bold text-foreground">{section.name}</p>
                      <div className="mt-1">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 border-b border-hairline py-2 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-foreground">{item.name || "Item"}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                              {formatCurrency(Number(item.price))}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between text-xs font-semibold text-muted-foreground">
                        <span>Section subtotal</span>
                        <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="border-t border-border pt-3">
                  <MoneyRow label="Quote total" value={formatCurrency(quoteContract)} strong />
                </div>
                {Math.abs(amount - quoteContract) > 0.01 && (
                  <p className="text-xs text-muted-foreground">
                    This invoice bills {formatCurrency(amount)} of the {formatCurrency(quoteContract)} contract.
                  </p>
                )}
              </div>
            )}
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
            {invoiceHistory.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {invoiceHistory.map((e) => (
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

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
      />
    </div>
  );
}

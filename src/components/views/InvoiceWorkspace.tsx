import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  getQuote,
  listClients,
  listInvoices,
  listProjects,
  listQuotes,
  listProjectEvents,
  logProjectEvent,
  pickHeadlineQuote,
  quoteItemIncluded,
  quoteLineTotal,
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

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";
const NONE = "__none__";

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

  const [shareUrl, setShareUrl] = useState<string | null>(null);

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

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

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

  const updateClientMut = useMutation({
    mutationFn: (newClientId: string | null) => updateInvoice(invoice.id, { client_id: newClientId }),
    onSuccess: invalidate,
    onError,
  });

  const updateProjectLinkMut = useMutation({
    mutationFn: async (newProjectId: string | null) => {
      const quoteId = newProjectId
        ? pickHeadlineQuote(await listQuotes(newProjectId))?.id ?? null
        : null;
      await updateInvoice(invoice.id, { project_id: newProjectId, quote_id: quoteId });
    },
    onSuccess: invalidate,
    onError,
  });

  const shareMut = useMutation({
    mutationFn: async () => {
      const token = invoice.share_token ?? (await generateShareLink("invoices", invoice.id));
      await updateInvoice(invoice.id, { status: "sent" });
      if (projectId && projectStatus !== "paid") {
        await updateProject(projectId, { status: "invoiced" });
      }
      return token;
    },
    onSuccess: (token) => {
      void logProjectEvent(projectId, "invoice_sent", `${number} shared · ${formatCurrency(amount)}`, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      });
      invalidate();
      setShareUrl(`${window.location.origin}/invoice/${token}`);
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
  const clientName = invoice.client?.name ?? invoice.project?.client?.name ?? null;

  const actionButton =
    invoice.status === "draft" ? (
      <>
        <Button
          onClick={() => shareMut.mutate()}
          disabled={shareMut.isPending || isDirty}
          className="h-11 w-full rounded-xl font-bold"
        >
          {shareMut.isPending ? "Preparing…" : "Share invoice"}
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
          className="h-11 w-full rounded-xl font-bold"
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
    <div className={cn("animate-fade-in space-y-5", isDirty && "pb-40 md:pb-28")}>
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
        <div className="overflow-hidden rounded-card border-2 border-primary bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-primary" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                  Client link is live
                </span>
              </div>
              <div className="truncate rounded-lg bg-muted px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
                {persistedLink}
              </div>
            </div>
            <Button
              onClick={() => setShareUrl(persistedLink)}
              className="h-11 shrink-0 rounded-xl font-bold"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Editable fields */}
          <section className="card-surface space-y-5 p-5">
            <h3 className="text-base font-bold text-foreground">Details</h3>
            <div className="space-y-1.5">
              <div className={FIELD_LABEL}>Amount</div>
              <div className="relative sm:max-w-xs">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="invoice-amount"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={draft.amount}
                  className={cn(FIELD_INPUT, "pl-6")}
                  onChange={(e) => editDraft({ amount: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
              <div className={FIELD_LABEL}>Due date</div>
              <Input
                id="invoice-due"
                type="date"
                value={draft.dueDate}
                onChange={(e) => editDraft({ dueDate: e.target.value })}
                className={FIELD_INPUT}
              />
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
              <div className={FIELD_LABEL}>Link to client</div>
              <Select
                value={invoice.client_id ?? NONE}
                onValueChange={(v) => updateClientMut.mutate(v === NONE ? null : v)}
                disabled={updateClientMut.isPending}
              >
                <SelectTrigger className={FIELD_INPUT}>
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
              <div className={FIELD_LABEL}>Link to project</div>
              <Select
                value={projectId ?? NONE}
                onValueChange={(v) => updateProjectLinkMut.mutate(v === NONE ? null : v)}
                disabled={updateProjectLinkMut.isPending}
              >
                <SelectTrigger className={FIELD_INPUT}>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className={FIELD_LABEL}>Notes</div>
              <Textarea
                id="invoice-notes"
                value={draft.notes}
                placeholder="Progress payment — foundation complete"
                onChange={(e) => editDraft({ notes: e.target.value })}
                className="rounded-xl border-transparent bg-muted px-3.5 py-3 focus-visible:border-primary focus-visible:bg-card"
              />
            </div>
          </section>

          {/* Line items — from the linked quote (read-only) */}
          {!quote || quote.quote_sections.length === 0 ? (
            <section className="card-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Line items</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                No linked quote — this invoice isn't itemised.
              </p>
            </section>
          ) : (
            <div className="space-y-4">
              {quote.quote_sections.map((section) => {
                const items = section.quote_items.filter((i) => quoteItemIncluded(section, i));
                if (items.length === 0) return null;
                const subtotal = items.reduce((s, i) => s + quoteLineTotal(i), 0);
                return (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-card border border-border bg-card shadow-card"
                  >
                    <div className="flex items-center justify-between gap-5 bg-sidebar px-5 py-4">
                      <span className="min-w-0 truncate text-[17px] font-bold tracking-tight text-background [overflow-wrap:anywhere]">
                        {section.name}
                      </span>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-background/55">{pluralize(items.length, "item")}</div>
                        <div className="mt-0.5 text-[17px] font-extrabold tracking-tight tabular-nums text-background">
                          {formatCurrency(subtotal)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 p-[18px]">
                      {items.map((item) => {
                        const qty = item.quantity == null ? 1 : Number(item.quantity);
                        const unit = item.unit?.trim();
                        const showQtyMeta = qty !== 1 || !!unit;
                        return (
                          <div key={item.id} className="rounded-2xl border border-hairline p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-semibold text-foreground [overflow-wrap:anywhere]">
                                  {item.name || "Item"}
                                </p>
                                {(showQtyMeta || item.description) && (
                                  <p className="mt-0.5 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                                    {showQtyMeta &&
                                      `${qty}${unit ? ` ${unit}` : ""} × ${formatCurrency(Number(item.price))}`}
                                    {showQtyMeta && item.description && " · "}
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-extrabold tabular-nums text-success">
                                {formatCurrency(quoteLineTotal(item))}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="overflow-hidden rounded-card border-2 border-primary bg-card p-4 shadow-card">
                <MoneyRow label="Quote total" value={formatCurrency(quoteContract)} strong />
                {Math.abs(amount - quoteContract) > 0.01 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    This invoice bills {formatCurrency(amount)} of the {formatCurrency(quoteContract)} contract.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="rounded-card border-2 border-primary bg-card p-5 shadow-card">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Amount due</p>
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

      <ShareLinkDialog
        open={!!shareUrl}
        onOpenChange={(open) => !open && setShareUrl(null)}
        url={shareUrl ?? ""}
        kind="invoice"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { draftChanges } from "@/lib/draftChanges";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Briefcase, Check, Copy, ExternalLink, FileText, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { addonQuoteNumbers, changeOrderNumbers } from "@/lib/featureFinancials";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { localYmd } from "@/lib/appointmentTime";
import {
  getQuote,
  listProjects,
  listQuotes,
  listChangeOrders,
  listProjectEvents,
  listInvoiceItems,
  saveInvoiceItems,
  invoiceItemsTotal,
  logProjectEvent,
  pickHeadlineQuote,
  projectContractValue,
  quoteItemIncluded,
  quoteLineTotal,
  quoteTotal,
  updateInvoice,
  generateShareLink,
  listInvoices,
  listPayments,
  listPaymentsForInvoice,
  applyProjectCredit,
  type Invoice,
  type Quote,
  snapshotDocument,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { effectiveInvoiceStatus, invoiceDaysLate } from "@/lib/financials";
import { invoiceBalance, invoicePaid, projectMoneySummary } from "@/lib/projectMoney";
import { RecordPaymentSheet } from "@/components/payments/RecordPaymentSheet";
import { PaymentsList } from "@/components/payments/PaymentsList";
import { useInvalidateMoney } from "@/hooks/use-invalidate-money";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";
const NONE = "__none__";

interface InvoiceWorkspaceProps {
  invoice: Invoice;
  projectId: string | null;
  backHref: string;
  backLabel: string;
}

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const newKey = () => crypto.randomUUID();
const lineTotal = (l: DraftLine) => (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);

/**
 * The invoice editor — same visual language as the Quote builder: the dark
 * Client/Project card block, a share-link strip, dark-headed item card, a
 * summary card with a clear total → paid → balance hierarchy and the
 * primary actions, plus a draft → sent → viewed → paid timeline.
 *
 * Line items (0097) are edited inline as a local draft and written on
 * "Save changes" (DraftSaveBar), like every other builder. An invoice with
 * no lines keeps a single editable amount; once itemised, its amount is
 * the lines' sum (saveInvoiceItems writes that to invoices.amount, so all
 * totals/revenue/aging keep reading `amount` unchanged).
 */
export function InvoiceWorkspace({ invoice, projectId, backHref, backLabel }: InvoiceWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

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
  // Only a standalone invoice (started outside a project) gets a project
  // picker — see the Project card below.
  const { data: activeProjects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: !projectId,
  });
  const { data: projectQuotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId!),
    enabled: !!projectId,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: projectId }],
    queryFn: () => listChangeOrders(projectId!),
    enabled: !!projectId,
  });
  const { data: serverItems } = useQuery({
    queryKey: ["invoice-items", invoice.id],
    queryFn: () => listInvoiceItems(invoice.id),
  });
  // Payments (0111) — the project's (for its unallocated credit and the
  // record-payment sheet's other open invoices) and this invoice's own.
  const { data: projectInvoices = [] } = useQuery({
    queryKey: ["invoices", { project: projectId }],
    queryFn: () => listInvoices(projectId!),
    enabled: !!projectId,
  });
  const { data: projectPayments = [] } = useQuery({
    queryKey: ["payments", { project: projectId }],
    queryFn: () => listPayments(projectId!),
    enabled: !!projectId,
  });
  const { data: invoicePayments = [] } = useQuery({
    queryKey: ["payments", { invoice: invoice.id }],
    queryFn: () => listPaymentsForInvoice(invoice.id),
  });
  const projectCredit = projectId
    ? projectMoneySummary({ contractValue: 0, invoices: projectInvoices, payments: projectPayments }).unallocatedCredit
    : 0;
  const invalidateMoney = useInvalidateMoney();
  // "Apply credit when sent" — a new (draft) invoice on a project with
  // credit offers it; it's applied as the invoice goes out.
  const [applyCreditOnSend, setApplyCreditOnSend] = useState(true);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
    qc.invalidateQueries({ queryKey: ["invoice-items", invoice.id] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project-events", projectId] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  // ---- draft: details + line items, saved together on "Save changes" ----
  const seedDraft = () => ({
    amount: String(invoice.amount),
    dueDate: invoice.due_date ?? "",
    notes: invoice.notes ?? "",
    lines: (serverItems ?? []).map((it) => ({
      key: it.id,
      description: it.description,
      quantity: String(it.quantity),
      unitPrice: String(it.unit_price),
    })) as DraftLine[],
  });
  const [draft, setDraft] = useState(seedDraft);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seedDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, serverItems]);
  const editDraft = (patch: Partial<ReturnType<typeof seedDraft>>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const editLine = (key: string, patch: Partial<DraftLine>) =>
    editDraft({ lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const discard = () => {
    dirty.current = false;
    setDraft(seedDraft());
  };
  const isDirty = dirty.current;

  const itemized = draft.lines.length > 0;
  const draftTotal = itemized ? draft.lines.reduce((s, l) => s + lineTotal(l), 0) : parseFloat(draft.amount) || 0;

  const saveMut = useMutation({
    mutationFn: async () => {
      await updateInvoice(invoice.id, { due_date: draft.dueDate || null, notes: draft.notes.trim() || null });
      await saveInvoiceItems(
        invoice.id,
        draft.lines
          .filter((l) => l.description.trim() || lineTotal(l) !== 0)
          .map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity) || 0, unit_price: parseFloat(l.unitPrice) || 0 })),
        parseFloat(draft.amount) || 0,
      );
    },
    onSuccess: () => {
      dirty.current = false;
      if (invoice.status !== "draft") void snapshotDocument("invoice", invoice.id);
      invalidate();
      toast({ title: "Invoice saved" });
    },
    onError,
  });

  const updateProjectLinkMut = useMutation({
    mutationFn: async (newProjectId: string | null) => {
      const quoteId = newProjectId ? (pickHeadlineQuote(await listQuotes(newProjectId))?.id ?? null) : null;
      await updateInvoice(invoice.id, { project_id: newProjectId, quote_id: quoteId });
    },
    onSuccess: invalidate,
    onError,
  });

  const shareMut = useMutation({
    mutationFn: async () => {
      const token = invoice.share_token ?? (await generateShareLink("invoices", invoice.id));
      if (invoice.status === "draft") {
        await updateInvoice(invoice.id, { status: "sent" });
        if (projectId && applyCreditOnSend && projectCredit > 0.004 && invoiceBalance(invoice) > 0.004) {
          await applyProjectCredit(projectId, invoice.id, Math.min(projectCredit, invoiceBalance(invoice)));
          invalidateMoney();
        }
      }
      return token;
    },
    onSuccess: (token) => {
      if (invoice.status === "draft") {
        void logProjectEvent(projectId, "invoice_sent", `${number} sent · ${formatCurrency(amount)}`, {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        });
      }
      invalidate();
      setShareUrl(`${window.location.origin}/invoice/${token}`);
    },
    onError,
  });

  const applyCreditMut = useMutation({
    mutationFn: (amt: number) => applyProjectCredit(projectId!, invoice.id, amt),
    onSuccess: (applied) => {
      invalidateMoney();
      toast({ title: `${formatCurrency(applied)} credit applied` });
    },
    onError,
  });

  const meta = invoiceStatusMeta(effectiveInvoiceStatus(invoice), invoice.amount_paid);
  const number = invoice.invoice_number ?? "Invoice";
  const amount = Number(invoice.amount);
  const isPaid = invoice.status === "paid";
  const daysLate = invoiceDaysLate(invoice, new Date());
  const shareLink = invoice.share_token ? `${window.location.origin}/invoice/${invoice.share_token}` : null;
  const clientName = invoice.project?.client?.name ?? null;
  const clientId = invoice.project?.client_id ?? null;
  const paid = invoicePaid(invoice);
  const balance = invoiceBalance(invoice);
  const creditToApply = Math.min(projectCredit, balance);

  // Project-level, change-order-inclusive contract for context.
  const projectContract = projectId ? projectContractValue(projectQuotes, changeOrders) : quote ? quoteTotal(quote.quote_sections) : 0;
  const invoiceHistory = events.filter((e) => e.meta?.invoice_id === invoice.id);
  const sentEvent = invoiceHistory.find((e) => e.kind === "invoice_sent");

  // Draft → Sent → Viewed → Paid. A step is done with a date when known;
  // "Sent" without a logged event still counts once the status moved on.
  const steps: { label: string; done: boolean; at: string | null }[] = [
    { label: "Draft", done: true, at: invoice.created_at },
    { label: "Sent", done: invoice.status !== "draft", at: sentEvent?.created_at ?? null },
    { label: "Viewed", done: !!invoice.viewed_at || isPaid, at: invoice.viewed_at ?? null },
    { label: "Paid", done: isPaid, at: invoice.paid_at },
  ];

  const fillFromQuote = () => {
    if (!quote) return;
    const lines: DraftLine[] = quote.quote_sections.flatMap((s) =>
      s.quote_items
        .filter((i) => quoteItemIncluded(s, i))
        .map((i) => ({
          key: newKey(),
          description: i.name || s.name,
          quantity: String(i.quantity == null ? 1 : Number(i.quantity)),
          unitPrice: String(Number(i.price)),
        })),
    );
    editDraft({ lines });
  };

  // Approved extra work on the job (0107/0108) — each can be billed as its
  // own line (edit the amount for a deposit or progress bill).
  const addonNumbers = addonQuoteNumbers(projectQuotes);
  const coNumbers = changeOrderNumbers(changeOrders);
  const billableExtras = [
    ...projectQuotes
      .filter((q) => q.kind === "addon" && q.status === "approved")
      .map((q) => ({ key: q.id, label: `Add-on quote #${addonNumbers.get(q.id) ?? ""}`, amount: quoteTotal(q.quote_sections) })),
    ...changeOrders
      .filter((co) => co.status === "approved")
      .map((co) => ({ key: co.id, label: `Change order #${coNumbers.get(co.id) ?? ""} — ${co.title}`, amount: Number(co.amount) })),
  ];
  const addBillableLine = (label: string, amount: number) =>
    editDraft({
      lines: [
        ...(draft.lines.length > 0
          ? draft.lines
          : [{ key: newKey(), description: invoice.notes || "Invoice amount", quantity: "1", unitPrice: draft.amount }].filter(
              (l) => Number(l.unitPrice) > 0,
            )),
        { key: newKey(), description: label, quantity: "1", unitPrice: String(Math.round(amount * 100) / 100) },
      ],
    });

  const pillClass =
    "flex h-auto w-full items-center gap-2.5 rounded-xl bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const pillLabel = "shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55";
  const pillValue = "min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background";

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
              <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">Due {invoice.due_date.slice(0, 10)}</span>
            )}
          </>
        }
      />

      <div className="hidden md:block">
        <BackLink to={backHref} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          {backLabel}
        </BackLink>
        <div className="mt-2 flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">{number}</h1>
          {daysLate > 0 ? <span className="badge-status badge-overdue">{daysLate} days late</span> : <StatusPill meta={meta} />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.due_date ? `Due ${invoice.due_date.slice(0, 10)}` : "No due date"}
          {projectContract > 0 && ` · bills ${formatCurrency(amount)} of the ${formatCurrency(projectContract)} contract`}
        </p>
      </div>

      {/* Client / Project cards + client link — same block as the Quote builder. */}
      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="grid grid-cols-1 gap-2.5 bg-foreground p-4 sm:grid-cols-2">
          {clientId ? (
            <Link to={`/clients/${clientId}`} aria-label="Open client" className={cn("group", pillClass)}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">
                {(clientName ?? "?").trim().charAt(0).toUpperCase()}
              </span>
              <span className={pillLabel}>Client</span>
              <span className={pillValue}>{clientName}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-background/50 group-hover:text-background" />
            </Link>
          ) : (
            <div className={cn(pillClass, "hover:bg-white/[0.08]")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-[13px] font-extrabold text-background">?</span>
              <span className={pillLabel}>Client</span>
              <span className={cn(pillValue, "text-background/60")}>{clientName ?? "From the project"}</span>
            </div>
          )}

          {projectId ? (
            <div className={cn("group relative cursor-pointer", pillClass, "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary")}>
              <GoToProjectLink projectId={projectId} isDirty={isDirty} variant="overlay" />
              <span className="pointer-events-none flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
                <Briefcase className="h-3.5 w-3.5" />
              </span>
              <span className={cn(pillLabel, "pointer-events-none")}>Project</span>
              <span className={cn(pillValue, "pointer-events-none")}>{invoice.project?.name ?? "Project"}</span>
              <ArrowRight className="pointer-events-none h-3.5 w-3.5 shrink-0 text-background/50 group-hover:text-background" />
            </div>
          ) : (
            // Started outside a project → the only place a project is picked.
            <Select value={NONE} onValueChange={(v) => updateProjectLinkMut.mutate(v === NONE ? null : v)} disabled={updateProjectLinkMut.isPending}>
              <SelectTrigger className={cn(pillClass, "border-none focus:ring-2 focus:ring-primary focus:ring-offset-0 [&>svg]:text-background")}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
                  <Briefcase className="h-3.5 w-3.5" />
                </span>
                <span className={pillLabel}>Project</span>
                <span className={pillValue}>Link a project</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3.5 bg-card p-4">
          <div className="min-w-0 flex-1 basis-60 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", shareLink && !isPaid ? "bg-primary" : "bg-border")} />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                {shareLink ? (isPaid ? "Paid — link still works" : "Client link is live") : "Not sent yet"}
              </span>
            </div>
            <div className="truncate rounded-lg bg-muted px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
              {shareLink ?? "Generated when you send this invoice"}
            </div>
          </div>
          {shareLink && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setShareUrl(shareLink)}>
                <Share2 className="mr-2 h-4 w-4" />
                Share link
              </Button>
              <Button asChild variant="outline" className="h-11 w-11 rounded-xl p-0" title="View as client">
                <a href={shareLink} target="_blank" rel="noreferrer" aria-label="View as client">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <section className="card-surface p-4 sm:p-5">
        <ol className="grid grid-cols-4 gap-1">
          {steps.map((step, i) => (
            <li key={step.label} className="relative flex flex-col items-center text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn("absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2", step.done ? "bg-primary" : "bg-border")}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                  step.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-subtle",
                )}
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("mt-1.5 text-xs font-bold", step.done ? "text-foreground" : "text-muted-subtle")}>{step.label}</span>
              <span className="text-[10px] text-muted-subtle">{step.done && step.at ? timeAgo(step.at) : " "}</span>
            </li>
          ))}
        </ol>
        {daysLate > 0 && !isPaid && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive">
            {daysLate} days past due
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Line items — dark header like a quote section */}
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
            <div className="flex items-center justify-between gap-5 bg-sidebar px-5 py-4">
              <span className="text-[17px] font-bold tracking-tight text-background">Line items</span>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-background/55">{itemized ? `${draft.lines.length} lines` : "Single amount"}</div>
                <div className="mt-0.5 text-[17px] font-extrabold tracking-tight tabular-nums text-background">{formatCurrency(draftTotal)}</div>
              </div>
            </div>
            <div className="space-y-3 p-4 sm:p-[18px]">
              {!itemized ? (
                <div className="space-y-2">
                  <div className={FIELD_LABEL}>Amount</div>
                  <div className="relative sm:max-w-xs">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      aria-label="Invoice amount"
                      value={draft.amount}
                      disabled={isPaid}
                      className={cn(FIELD_INPUT, "pl-6 text-base font-bold tabular-nums")}
                      onChange={(e) => editDraft({ amount: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                draft.lines.map((l, i) => (
                  <div key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-hairline p-3 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_6.5rem_2rem] sm:items-center">
                    <Input
                      aria-label={`Line ${i + 1} description`}
                      value={l.description}
                      disabled={isPaid}
                      onChange={(e) => editLine(l.key, { description: e.target.value })}
                      placeholder="Description"
                      className="h-10 rounded-xl border-transparent bg-muted font-semibold focus-visible:border-primary focus-visible:bg-card"
                    />
                    <button
                      type="button"
                      disabled={isPaid}
                      onClick={() => editDraft({ lines: draft.lines.filter((x) => x.key !== l.key) })}
                      className="flex h-10 w-8 items-center justify-center rounded-lg text-muted-subtle hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 sm:order-last"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="col-span-2 grid grid-cols-3 gap-2 sm:contents">
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`Line ${i + 1} quantity`}
                        value={l.quantity}
                        disabled={isPaid}
                        onChange={(e) => editLine(l.key, { quantity: e.target.value })}
                        className="h-10 rounded-xl border-transparent bg-muted tabular-nums"
                      />
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Line ${i + 1} unit price`}
                          value={l.unitPrice}
                          disabled={isPaid}
                          onChange={(e) => editLine(l.key, { unitPrice: e.target.value })}
                          className="h-10 rounded-xl border-transparent bg-muted pl-6 tabular-nums"
                        />
                      </div>
                      <span className="flex h-10 items-center justify-end rounded-xl bg-primary/10 px-3 text-sm font-extrabold tabular-nums text-success">
                        {formatCurrency(lineTotal(l))}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {!isPaid && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-primary/40 bg-primary/5 font-bold text-primary hover:bg-primary/10"
                    onClick={() =>
                      editDraft({
                        lines: itemized
                          ? [...draft.lines, { key: newKey(), description: "", quantity: "1", unitPrice: "" }]
                          : // Itemising: the current amount becomes the first line.
                            [{ key: newKey(), description: invoice.notes || "Invoice amount", quantity: "1", unitPrice: draft.amount }],
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {itemized ? "Add line item" : "Itemize this invoice"}
                  </Button>
                  {quote && quote.quote_sections.length > 0 && (
                    <Button type="button" variant="ghost" className="h-10 font-semibold text-muted-foreground" onClick={fillFromQuote}>
                      <FileText className="mr-1.5 h-4 w-4" />
                      {itemized ? "Replace with quote lines" : "Add lines from quote"}
                    </Button>
                  )}
                  {billableExtras.map((b) => (
                    <Button
                      key={b.key}
                      type="button"
                      variant="ghost"
                      // Long change-order titles wrap instead of running off a phone screen.
                      className="h-auto min-h-10 max-w-full whitespace-normal py-2 text-left font-semibold text-muted-foreground"
                      onClick={() => addBillableLine(b.label, b.amount)}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      {b.label} · {formatCurrency(b.amount)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <section className="card-surface space-y-4 p-5">
            <h3 className="text-base font-bold text-foreground">Details</h3>
            <div className="space-y-1.5 sm:max-w-xs">
              <div className={FIELD_LABEL}>Due date</div>
              <Input type="date" value={draft.dueDate} onChange={(e) => editDraft({ dueDate: e.target.value })} className={FIELD_INPUT} />
            </div>
            <div className="space-y-1.5">
              <div className={FIELD_LABEL}>Notes</div>
              <AutoGrowTextarea
                rows={3}
                value={draft.notes}
                placeholder="Progress payment — foundation complete"
                onChange={(e) => editDraft({ notes: e.target.value })}
                className="rounded-xl border-transparent bg-muted px-3.5 py-3 text-sm leading-relaxed focus-visible:border-primary focus-visible:bg-card"
              />
            </div>
          </section>
        </div>

        {/* Right rail — payment summary + actions, then history */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="card-surface flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Balance due</div>
                <div className="mt-1 text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
                  {formatCurrency(balance)}
                </div>
              </div>
              <StatusPill meta={meta} />
            </div>
            <div className="border-t border-hairline pt-2">
              <MoneyRow label="Invoice total" value={formatCurrency(amount)} />
              <MoneyRow label="Payments applied" value={formatCurrency(paid)} />
              <MoneyRow label="Balance due" value={formatCurrency(balance)} strong />
              {isPaid && invoice.paid_at && (
                <p className="mt-1 text-xs text-muted-foreground">Paid {new Date(invoice.paid_at).toLocaleDateString()}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {invoice.status === "draft" && (
                <Button className="h-11 rounded-xl font-bold" disabled={shareMut.isPending || isDirty} onClick={() => shareMut.mutate()}>
                  <Share2 className="mr-2 h-4 w-4" />
                  {shareMut.isPending ? "Preparing…" : "Send invoice"}
                </Button>
              )}
              {invoice.status === "draft" && creditToApply > 0.004 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-success/10 p-3 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                    checked={applyCreditOnSend}
                    onChange={(e) => setApplyCreditOnSend(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">Apply {formatCurrency(creditToApply)} project credit</span> when this invoice is sent —
                    the project has {formatCurrency(projectCredit)} unallocated.
                  </span>
                </label>
              )}
              {(invoice.status === "sent" || invoice.status === "overdue") && (
                <>
                  {creditToApply > 0.004 && (
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-success/40 font-bold text-success hover:text-success"
                      disabled={applyCreditMut.isPending || isDirty}
                      onClick={() => applyCreditMut.mutate(creditToApply)}
                    >
                      Apply {formatCurrency(creditToApply)} credit
                    </Button>
                  )}
                  <Button className="h-11 rounded-xl font-bold" disabled={isDirty} onClick={() => setPaymentOpen(true)}>
                    <Check className="mr-2 h-4 w-4" />
                    Record payment
                  </Button>
                  <Button variant="outline" className="h-11 rounded-xl" disabled={shareMut.isPending} onClick={() => shareMut.mutate()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Share link
                  </Button>
                </>
              )}
              {isPaid && <p className="text-center text-sm text-muted-foreground">Paid in full — nothing left to collect.</p>}
              {isDirty && <p className="text-center text-xs text-muted-foreground">Save your changes first.</p>}
            </div>
          </section>

          {invoicePayments.length > 0 && (
            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Payments</h3>
              <div className="mt-1">
                <PaymentsList payments={invoicePayments} invoices={projectId ? projectInvoices : [invoice]} projectId={projectId} />
              </div>
            </section>
          )}

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">History</h3>
            {invoiceHistory.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {invoiceHistory.map((e) => (
                  <li key={e.id}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{timeAgo(e.created_at)}</div>
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
        count={isDirty ? draftChanges(draft, seedDraft()).count : 0}
        // A sent invoice snapshots a client-visible version on every save — drafts only.
        autoSave={invoice.status === "draft" ? { key: draft } : undefined}
      />

      <ShareLinkDialog open={!!shareUrl} onOpenChange={(open) => !open && setShareUrl(null)} url={shareUrl ?? ""} kind="invoice" />

      <RecordPaymentSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        projectId={projectId}
        invoices={projectId ? projectInvoices : [invoice]}
        defaultInvoiceId={invoice.id}
        onSaved={() => {
          void logProjectEvent(projectId, "invoice_paid", `Payment recorded · ${number}`, {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
          });
          invalidate();
        }}
      />
    </div>
  );
}

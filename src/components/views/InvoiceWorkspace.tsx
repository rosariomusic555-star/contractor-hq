import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Briefcase, Check, ChevronDown, Copy, ExternalLink, FileText, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { ActionMenu } from "@/components/responsive/ActionMenu";
import { BuilderActionBar, BreakdownRow } from "@/components/responsive/BuilderActionBar";
import { SheetSelect } from "@/components/responsive/SheetSelect";
import { ShareLinkRow } from "@/components/responsive/ShareLinkRow";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
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
  type Invoice,
  type Quote,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { invoiceDaysLate } from "@/lib/financials";

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
      if (invoice.status === "draft") await updateInvoice(invoice.id, { status: "sent" });
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

  const recordPaymentMut = useMutation({
    mutationFn: (paidOn: string) =>
      updateInvoice(invoice.id, {
        status: "paid",
        // Today → now; an earlier date → local noon of that day.
        paid_at: paidOn === localYmd(new Date()) ? new Date().toISOString() : new Date(`${paidOn}T12:00:00`).toISOString(),
      }),
    onSuccess: () => {
      void logProjectEvent(projectId, "invoice_paid", `Payment received · ${number} · ${formatCurrency(amount)}`, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      });
      invalidate();
      setPaymentOpen(false);
      toast({ title: "Payment recorded" });
    },
    onError,
  });

  const meta = invoiceStatusMeta(invoice.status);
  const number = invoice.invoice_number ?? "Invoice";
  const amount = Number(invoice.amount);
  const isPaid = invoice.status === "paid";
  const daysLate = invoiceDaysLate(invoice, new Date());
  const shareLink = invoice.share_token ? `${window.location.origin}/invoice/${invoice.share_token}` : null;
  const clientName = invoice.project?.client?.name ?? null;
  const clientId = invoice.project?.client_id ?? null;
  const paid = isPaid ? amount : 0;
  const balance = Math.max(0, amount - paid);

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

  const pillClass =
    "flex h-auto w-full items-center gap-2.5 rounded-xl bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const pillLabel = "shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55";
  const pillValue = "min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background";

  return (
    <div className={cn("animate-fade-in space-y-4 md:space-y-5", isDirty && "md:pb-28")}>
      <MobilePageHeader
        title={<span className="line-clamp-2 break-words">{number}</span>}
        actions={
          shareLink ? (
            <ActionMenu
              tone="dark"
              className="-mr-2 -mt-1"
              title={number}
              ariaLabel="Invoice actions"
              items={[
                { label: "View as client", icon: ExternalLink, onSelect: () => window.open(shareLink, "_blank", "noopener") },
                { label: "Share link", icon: Share2, onSelect: () => setShareUrl(shareLink) },
              ]}
            />
          ) : undefined
        }
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
        <div className="grid grid-cols-1 gap-2 bg-foreground p-3 sm:grid-cols-2 sm:gap-2.5 sm:p-4">
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
            <SheetSelect
              value={NONE}
              onValueChange={(v) => updateProjectLinkMut.mutate(v === NONE ? null : v)}
              disabled={updateProjectLinkMut.isPending}
              options={[{ value: NONE, label: "No project" }, ...activeProjects.map((p) => ({ value: p.id, label: p.name }))]}
              title="Link a project"
              ariaLabel="Link a project"
              triggerClassName={cn(pillClass, "border-none focus:ring-2 focus:ring-primary focus:ring-offset-0 [&>svg]:text-background")}
              renderTrigger={() => (
                <>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
                    <Briefcase className="h-3.5 w-3.5" />
                  </span>
                  <span className={pillLabel}>Project</span>
                  <span className={pillValue}>Link a project</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-background/70" />
                </>
              )}
            />
          )}
        </div>
        {/* Phones: status + one row — middle-truncated url · Share · Copy. */}
        <div className="space-y-1.5 bg-card p-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", shareLink && !isPaid ? "bg-primary" : "bg-border")} />
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
              {shareLink ? (isPaid ? "Paid — link still works" : "Client link is live") : "Not sent yet"}
            </span>
          </div>
          <ShareLinkRow
            url={shareLink}
            placeholder="Created when you send this invoice"
            onShare={() => (shareLink ? setShareUrl(shareLink) : shareMut.mutate())}
            disabled={!shareLink && (isDirty || shareMut.isPending)}
          />
        </div>
        <div className="hidden flex-wrap items-center gap-3.5 bg-card p-4 md:flex">
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
            <div className="flex items-center justify-between gap-3 bg-sidebar px-3 py-3 sm:gap-5 sm:px-5 sm:py-4">
              <span className="text-[17px] font-bold tracking-tight text-background">Line items</span>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-background/55">{itemized ? `${draft.lines.length} lines` : "Single amount"}</div>
                <div className="mt-0.5 text-[17px] font-extrabold tracking-tight tabular-nums text-background">{formatCurrency(draftTotal)}</div>
              </div>
            </div>
            <div className="space-y-3 p-3 sm:p-[18px]">
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
                      className="h-11 rounded-xl border-transparent bg-muted font-semibold focus-visible:border-primary focus-visible:bg-card sm:h-10"
                    />
                    <button
                      type="button"
                      disabled={isPaid}
                      onClick={() => editDraft({ lines: draft.lines.filter((x) => x.key !== l.key) })}
                      className="-mr-1 flex h-11 w-11 items-center justify-center rounded-lg text-muted-subtle hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 sm:order-last sm:mr-0 sm:h-10 sm:w-8"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {/* Phones: Qty · Unit price two-up, total on its own row. */}
                    <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`Line ${i + 1} quantity`}
                        value={l.quantity}
                        disabled={isPaid}
                        onChange={(e) => editLine(l.key, { quantity: e.target.value })}
                        className="h-11 rounded-xl border-transparent bg-muted tabular-nums sm:h-10"
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
                          className="h-11 rounded-xl border-transparent bg-muted pl-6 tabular-nums sm:h-10"
                        />
                      </div>
                      <span className="col-span-2 flex h-11 items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 text-base font-extrabold tabular-nums text-success sm:col-span-1 sm:h-10 sm:justify-end sm:text-sm">
                        <span className={cn(FIELD_LABEL, "sm:hidden")}>Line total</span>
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
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <section className="card-surface space-y-4 p-4 sm:p-5">
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
                className="rounded-xl border-transparent bg-muted px-3.5 py-3 text-base leading-relaxed focus-visible:border-primary focus-visible:bg-card md:text-sm"
              />
            </div>
          </section>
        </div>

        {/* Right rail — payment summary + actions, then history */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="card-surface flex flex-col gap-4 p-4 sm:p-5">
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
              <MoneyRow label="Paid" value={formatCurrency(paid)} />
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
              {(invoice.status === "sent" || invoice.status === "overdue") && (
                <>
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

          <section className="card-surface p-4 sm:p-5">
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

      <BuilderActionBar
        isDirty={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        figureLabel={isPaid ? "Paid in full" : "Balance due"}
        // Live off the draft, so the figure moves as lines are edited.
        figure={formatCurrency(isPaid ? 0 : draftTotal)}
        breakdownTitle={number}
        breakdown={
          <div>
            {itemized &&
              draft.lines.map((l, i) => (
                <BreakdownRow
                  key={l.key}
                  label={<span className="block max-w-[14rem] truncate">{l.description || `Line ${i + 1}`}</span>}
                  value={formatCurrency(lineTotal(l))}
                />
              ))}
            <BreakdownRow strong label="Invoice total" value={formatCurrency(draftTotal)} />
            <BreakdownRow label="Paid" value={formatCurrency(isPaid ? draftTotal : 0)} />
            <BreakdownRow strong label="Balance due" value={formatCurrency(isPaid ? 0 : draftTotal)} />
          </div>
        }
        primaryAction={
          invoice.status === "draft"
            ? { label: shareMut.isPending ? "Preparing…" : "Send invoice", onClick: () => shareMut.mutate(), disabled: shareMut.isPending }
            : invoice.status === "sent" || invoice.status === "overdue"
              ? { label: "Record payment", onClick: () => setPaymentOpen(true) }
              : shareLink
                ? { label: "Share link", onClick: () => setShareUrl(shareLink) }
                : undefined
        }
      />

      <ShareLinkDialog open={!!shareUrl} onOpenChange={(open) => !open && setShareUrl(null)} url={shareUrl ?? ""} kind="invoice" />

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        amount={amount}
        saving={recordPaymentMut.isPending}
        onRecord={(date) => recordPaymentMut.mutate(date)}
      />
    </div>
  );
}

/** "Record payment" — the invoice is paid in full on the chosen date. */
function RecordPaymentDialog({
  open,
  onOpenChange,
  amount,
  saving,
  onRecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  saving: boolean;
  onRecord: (date: string) => void;
}) {
  const [date, setDate] = useState(() => localYmd(new Date()));
  useEffect(() => {
    if (open) setDate(localYmd(new Date()));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Marks this invoice paid in full — {formatCurrency(amount)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="paid-on">Paid on</Label>
          <Input id="paid-on" type="date" value={date} max={localYmd(new Date())} onChange={(e) => setDate(e.target.value || localYmd(new Date()))} />
        </div>
        <Button className="w-full font-bold" disabled={saving} onClick={() => onRecord(date)}>
          {saving ? "Saving…" : `Record ${formatCurrency(amount)} paid`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

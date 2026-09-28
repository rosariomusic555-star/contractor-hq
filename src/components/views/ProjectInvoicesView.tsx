import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Copy, ExternalLink, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/common/StatusPill";
import { KpiCard } from "@/components/common/KpiCard";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { PaymentsList } from "@/components/payments/PaymentsList";
import { RecordPaymentSheet } from "@/components/payments/RecordPaymentSheet";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DEPOSIT_INVOICE_NOTE,
  createProjectInvoice,
  getProject,
  listChangeOrders,
  listInvoices,
  listPayments,
  listQuotes,
  projectContractValue,
  type Invoice,
} from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { effectiveInvoiceStatus } from "@/lib/financials";
import { invoiceBalance, invoicePaid, overInvoiced, projectMoneySummary, remainingToInvoice } from "@/lib/projectMoney";
import {
  changeOrderNumbers,
  invoiceClientStep,
  invoiceKindLabel,
  invoicesNeedingAttention,
  invoicesPaidLine,
  invoiceTiming,
  type Tone,
} from "@/lib/projectBilling";

const TONE_TEXT: Record<Tone, string> = {
  muted: "text-muted-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

const shareUrl = (inv: Pick<Invoice, "share_token">) => (inv.share_token ? `${window.location.origin}/invoice/${inv.share_token}` : null);

/**
 * A project's invoices: where the money stands (contract → invoiced →
 * collected → outstanding), what needs chasing, every invoice with its
 * type, due timing, client state and paid progress, quick actions, and the
 * payments received. Same header/KPI look as the quote builder and the
 * project page. Numbers come from projectMoney.ts (the one money source).
 */
export function ProjectInvoicesView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<{ invoiceId: string | null } | null>(null);

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: invoices = [], isLoading, isError, error } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders", { project: id }], queryFn: () => listChangeOrders(id) });
  const { data: payments = [] } = useQuery({ queryKey: ["payments", { project: id }], queryFn: () => listPayments(id) });

  const contract = projectContractValue(quotes, changeOrders);
  const money = projectMoneySummary({ contractValue: contract, invoices, payments });
  // What "Remaining balance" will actually create — drafts count as already billed.
  const balanceToBill = remainingToInvoice(contract, invoices);
  const draftTotal = invoices.filter((i) => i.status === "draft").reduce((s, i) => s + Number(i.amount || 0), 0);
  const overBy = overInvoiced(contract, invoices);
  const coNumbers = changeOrderNumbers(changeOrders);
  const attention = invoicesNeedingAttention(invoices);
  const attentionCount = attention.overdue.length + attention.notOpened.length + attention.viewedUnpaid.length;
  const paidLine = invoicesPaidLine(invoices);
  const hasDeposit = invoices.some((i) => i.notes === DEPOSIT_INVOICE_NOTE);
  // Newest first; numbers (INV-001…) are stored, so order doesn't change them.
  const sorted = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const clientName = project?.client?.name ?? null;

  const createMut = useMutation({
    mutationFn: (kind: "auto" | "deposit" | "balance") => createProjectInvoice(id, kind),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["project-events", id] });
      navigate(`/projects/${id}/invoices/${invoice.id}`);
    },
    onError: (err: Error) => toast({ title: "Couldn't create the invoice", description: err.message, variant: "destructive" }),
  });

  const copyLink = async (inv: Invoice) => {
    const url = shareUrl(inv);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: `${inv.invoice_number ?? "Invoice"} — paste it in a text or email.` });
    } catch {
      toast({ title: "Couldn't copy", description: url });
    }
  };

  if (isLoading) return <p className="text-muted-foreground">Loading invoices…</p>;
  if (isError || !project) return <p className="text-destructive">Failed to load invoices: {(error as Error)?.message}</p>;

  const newInvoiceMenu = (full: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn("font-bold", full && "h-11 flex-1")} disabled={createMut.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {createMut.isPending ? "Creating…" : "New invoice"}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {!hasDeposit && <DropdownMenuItem onSelect={() => createMut.mutate("deposit")}>Deposit (from the quote's deposit %)</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => createMut.mutate("balance")}>
          Remaining balance{balanceToBill > 0 ? ` · ${formatCurrency(balanceToBill)}` : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-5">
      <MobilePageHeader
        className="mobile-header-ink"
        title="Invoices"
        subtitle={[project.name, clientName].filter(Boolean).join(" · ")}
        back={{ to: `/projects/${id}`, label: "Project" }}
        pills={paidLine ? <span className="badge-status !bg-white/20 !text-sidebar-foreground">{paidLine}</span> : undefined}
      />

      {/* Desktop header — same shape as the quote builder's */}
      <div className="hidden md:block">
        <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Back to project
        </BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-subtle">Invoices</div>
            <div className="mt-1 flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">{project.name}</h1>
              {paidLine && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground">{paidLine}</span>}
            </div>
            {clientName && <p className="mt-1 text-sm text-muted-foreground">{clientName}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPaying({ invoiceId: null })} disabled={invoices.every((i) => i.status === "draft")}>
              <Wallet className="mr-1.5 h-4 w-4" /> Record payment
            </Button>
            {newInvoiceMenu(false)}
          </div>
        </div>
      </div>

      {/* Phones: the two actions under the header */}
      <div className="flex gap-2 md:hidden">
        <Button variant="outline" className="h-11 flex-1" onClick={() => setPaying({ invoiceId: null })} disabled={invoices.every((i) => i.status === "draft")}>
          <Wallet className="mr-1.5 h-4 w-4" /> Payment
        </Button>
        {newInvoiceMenu(true)}
      </div>

      {/* Where the money stands */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Contract" value={formatCurrency(money.contractValue)} sub={changeOrders.some((c) => c.status === "approved") ? "incl. change orders" : "signed quote"} />
          <KpiCard label="Invoiced" value={formatCurrency(money.invoiced)} sub={contract > 0 ? `${Math.round((money.invoiced / contract) * 100)}% of contract` : "no contract total yet"} />
          <KpiCard
            label="Collected"
            value={formatCurrency(money.received)}
            sub={contract > 0 ? (money.overpaid > 0 ? `${formatCurrency(money.overpaid)} overpaid` : `${Math.round((money.received / contract) * 100)}% of contract`) : "payments received"}
            subTone="positive"
          />
          <KpiCard label="Outstanding" value={formatCurrency(money.unpaidInvoiceBalance)} sub={attention.overdue.length ? `${attention.overdue.length} late` : "on invoices sent"} subTone={attention.overdue.length ? "negative" : "muted"} />
          <KpiCard
            label="Not invoiced yet"
            value={formatCurrency(balanceToBill)}
            sub={
              overBy > 0
                ? `invoices are ${formatCurrency(overBy)} over the contract`
                : draftTotal > 0
                  ? `left to bill · ${formatCurrency(draftTotal)} in drafts`
                  : "left to bill"
            }
            subTone={overBy > 0 ? "negative" : "muted"}
            className="col-span-2 md:col-span-1"
          />
        </div>
        {contract > 0 && (
          <div className="card-surface px-4 py-3">
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" aria-label="Collected and invoiced, of the contract">
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: `${Math.min(100, (money.invoiced / contract) * 100)}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, (money.received / contract) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Collected</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/35" /> Invoiced</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/25" /> Not invoiced</span>
            </div>
          </div>
        )}
      </section>

      {/* Needs attention */}
      {attentionCount > 0 && (
        <section className="rounded-card border border-warning-strong/40 bg-warning-strong/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" /> Needs attention
          </h3>
          <ul className="mt-2 divide-y divide-hairline">
            {[
              ...attention.overdue.map((i) => ({ i, why: invoiceTiming(i).text, tone: "bad" as Tone })),
              ...attention.viewedUnpaid.map((i) => ({ i, why: "Opened, not paid yet", tone: "warn" as Tone })),
              ...attention.notOpened.map((i) => ({ i, why: "Sent, not opened yet", tone: "muted" as Tone })),
            ].map(({ i, why, tone }) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/projects/${id}/invoices/${i.id}`} className="min-w-0 text-sm hover:underline">
                  <span className="font-semibold text-foreground">{i.invoice_number ?? "Invoice"}</span>
                  <span className={cn("ml-2", TONE_TEXT[tone])}>{why}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">{formatCurrency(invoiceBalance(i))} due</span>
                </Link>
                <div className="flex gap-1.5">
                  {i.share_token && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void copyLink(i)}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy link to resend
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPaying({ invoiceId: i.id })}>
                    Record payment
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Every invoice */}
      <section className="space-y-2.5">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">All invoices</h2>
        {invoices.length === 0 ? (
          <div className="card-surface p-10 text-center">
            <p className="text-sm text-muted-foreground">No invoices yet. Start with the deposit, or bill the balance.</p>
            <div className="mt-4 flex justify-center">{newInvoiceMenu(false)}</div>
          </div>
        ) : (
          sorted.map((inv) => {
            const timing = invoiceTiming(inv);
            const step = invoiceClientStep(inv);
            const paid = invoicePaid(inv);
            const amount = Number(inv.amount);
            const balance = invoiceBalance(inv);
            const open = `/projects/${id}/invoices/${inv.id}`;
            return (
              <div key={inv.id} className="card-surface flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover sm:flex-row sm:items-center">
                <Link to={open} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{inv.invoice_number ?? "Invoice"}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{invoiceKindLabel(inv, coNumbers)}</span>
                    <StatusPill meta={invoiceStatusMeta(effectiveInvoiceStatus(inv), inv.amount_paid)} />
                  </div>
                  <p className="mt-1 text-xs">
                    <span className={cn("font-semibold", TONE_TEXT[timing.tone])}>{timing.text}</span>
                    {/* Sent / Viewed only — Paid / Partially paid are already the pill. */}
                    {(step.label.startsWith("Sent") || step.label === "Viewed") && <span className="text-muted-foreground"> · {step.label}</span>}
                  </p>
                </Link>
                {/* Phones: amount and actions share a row; sm+: their own columns. */}
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <Link to={open} className="min-w-0 flex-1 sm:w-52 sm:flex-none">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-bold tabular-nums text-foreground">{formatCurrency(amount)}</span>
                      {inv.status !== "draft" && balance > 0.004 && paid > 0.004 && <span className="text-[11px] tabular-nums text-muted-foreground">{formatCurrency(balance)} left</span>}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", balance <= 0.004 && amount > 0 ? "bg-success" : "bg-primary")} style={{ width: `${amount > 0 ? Math.min(100, (paid / amount) * 100) : 0}%` }} />
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[11rem]">
                    {inv.status === "draft" ? (
                      <Button size="sm" variant="outline" className="h-9" asChild>
                        <Link to={open}>Finish & send</Link>
                      </Button>
                    ) : balance > 0.004 ? (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setPaying({ invoiceId: inv.id })}>
                        Record payment
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`More for ${inv.invoice_number ?? "invoice"}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(open)}>Open</DropdownMenuItem>
                        {inv.share_token && (
                          <>
                            <DropdownMenuItem onSelect={() => void copyLink(inv)}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Copy client link
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.open(shareUrl(inv)!, "_blank", "noopener")}>
                              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Client's page (print / PDF)
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Payments received */}
      <section className="card-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">Payments</h2>
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(money.received)} received</span>
        </div>
        <div className="mt-3">
          <PaymentsList payments={payments} invoices={invoices} projectId={id} emptyLabel="No payments recorded yet." />
        </div>
      </section>

      <RecordPaymentSheet
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        projectId={id}
        invoices={invoices}
        defaultInvoiceId={paying?.invoiceId ?? null}
      />
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Copy, ExternalLink, FilePlus2, MoreHorizontal, PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/common/StatusPill";
import { KpiCard } from "@/components/common/KpiCard";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { ManualApprovalDialog, type ManualApproval } from "@/components/common/ManualApprovalDialog";
import { useToast } from "@/hooks/use-toast";
import { useRecorderName } from "@/hooks/use-recorder-name";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  CHANGE_ORDER_REASONS,
  contractorApproveChangeOrder,
  createChangeOrder,
  createChangeOrderInvoice,
  getProject,
  listCategories,
  listChangeOrders,
  listInvoices,
  listProjectFeatures,
  listQuotes,
  projectContractValue,
  type ChangeOrder,
} from "@/lib/api";
import { changeOrderStatusMeta, invoiceStatusMeta } from "@/lib/statusMeta";
import { featureName } from "@/lib/features";
import { changeOrderDecisionLine, changeOrderInvoiceable, changeOrderNumbers, changeOrderSummary, invoicesByChangeOrder, signedMoney } from "@/lib/projectBilling";

const amountColor = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-foreground");
const shareUrl = (co: Pick<ChangeOrder, "share_token">) => (co.share_token ? `${window.location.origin}/change-order/${co.share_token}` : null);
const days = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;

/**
 * A project's change orders: the contract story (original → approved
 * changes → current, plus what's waiting on the client and the schedule
 * impact), the ones waiting on the client, and every change order with its
 * reason, affected features, amount, schedule impact, who approved it and
 * how, and whether it's been invoiced — with the quick actions for each
 * state. Same look as the quote builder and the project page.
 */
export function ProjectChangeOrdersView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const recordedBy = useRecorderName();
  const [approving, setApproving] = useState<ChangeOrder | null>(null);

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: changeOrders = [], isLoading, isError, error } = useQuery({ queryKey: ["change-orders", { project: id }], queryFn: () => listChangeOrders(id) });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: features = [] } = useQuery({ queryKey: ["project-features", id], queryFn: () => listProjectFeatures(id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const contract = projectContractValue(quotes, changeOrders);
  const summary = changeOrderSummary(changeOrders, contract);
  const numbers = changeOrderNumbers(changeOrders);
  const invoicesFor = invoicesByChangeOrder(invoices);
  const waiting = changeOrders.filter((co) => co.status === "sent");
  const sorted = [...changeOrders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const clientName = project?.client?.name ?? null;
  const featureLabel = (fid: string) => {
    const f = features.find((x) => x.id === fid);
    return f ? featureName(f, categories) : null;
  };

  const refresh = () => {
    for (const k of ["change-orders", "change-order", "projects", "invoices", "project-events", "materials", "project-features", "feature-history", "pending-cost-changes"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const onError = (err: Error) => toast({ title: "Something went wrong", description: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: () => createChangeOrder({ project_id: id }),
    onSuccess: (co) => navigate(`/projects/${id}/change-orders/${co.id}`),
    onError,
  });
  const approveMut = useMutation({
    mutationFn: ({ co, a }: { co: ChangeOrder; a: ManualApproval }) =>
      contractorApproveChangeOrder({
        changeOrderId: co.id,
        method: a.method,
        note: a.note,
        signedBy: a.signedBy,
        approvedOn: a.approvedOn,
        recordedBy,
      }),
    onSuccess: () => {
      setApproving(null);
      refresh();
      toast({ title: "Change order approved", description: "The contract, features and schedule are updated." });
    },
    onError,
  });
  const invoiceMut = useMutation({
    mutationFn: (co: ChangeOrder) => createChangeOrderInvoice(co),
    onSuccess: (invoice) => {
      refresh();
      navigate(`/projects/${id}/invoices/${invoice.id}`);
    },
    onError,
  });

  const copyLink = async (co: ChangeOrder) => {
    const url = shareUrl(co);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it in a text or email to the client." });
    } catch {
      toast({ title: "Couldn't copy", description: url });
    }
  };

  const newButton = (full = false) => (
    <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className={cn("font-bold", full && "h-11 w-full")}>
      <Plus className="mr-1.5 h-4 w-4" />
      {createMut.isPending ? "Creating…" : "New change order"}
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-5">
      <MobilePageHeader
        className="mobile-header-ink"
        title="Change orders"
        subtitle={[project?.name, clientName].filter(Boolean).join(" · ")}
        back={{ to: `/projects/${id}`, label: "Project" }}
        pills={
          waiting.length > 0 ? <span className="badge-status !bg-white/20 !text-sidebar-foreground">{waiting.length} waiting on the client</span> : undefined
        }
      />

      <div className="hidden md:block">
        <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Back to project
        </BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-subtle">Change orders</div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-foreground">{project?.name ?? " "}</h1>
            {clientName && <p className="mt-1 text-sm text-muted-foreground">{clientName}</p>}
          </div>
          {newButton()}
        </div>
      </div>
      <div className="md:hidden">{newButton(true)}</div>

      {isLoading && <p className="text-muted-foreground">Loading change orders…</p>}
      {isError && <p className="text-destructive">Failed to load change orders: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          {/* The contract story */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Original contract" value={formatCurrency(summary.original)} sub="signed quote" />
            <KpiCard
              label="Approved changes"
              value={<span className={amountColor(summary.approvedChanges)}>{signedMoney(summary.approvedChanges, formatCurrency)}</span>}
              sub={pluralize(changeOrders.filter((c) => c.status === "approved").length, "change order")}
            />
            <KpiCard label="Current contract" value={formatCurrency(summary.current)} sub="what the client owes in total" />
            <KpiCard
              label="Waiting on client"
              value={summary.pending.count ? signedMoney(summary.pending.total, formatCurrency) : "—"}
              sub={summary.pending.count ? pluralize(summary.pending.count, "change order") : "nothing pending"}
              subTone={summary.pending.count ? "negative" : "muted"}
            />
            <KpiCard
              label="Schedule"
              value={summary.scheduleDays ? days(summary.scheduleDays) : "No change"}
              sub="from approved changes"
              className="col-span-2 md:col-span-1"
            />
          </div>

          {/* Waiting on the client */}
          {waiting.length > 0 && (
            <section className="rounded-card border border-info/40 bg-info/5 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Clock className="h-4 w-4 text-info" /> Waiting on the client
              </h3>
              <ul className="mt-2 divide-y divide-hairline">
                {waiting.map((co) => (
                  <li key={co.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link to={`/projects/${id}/change-orders/${co.id}`} className="min-w-0 text-sm hover:underline">
                      <span className="font-semibold text-foreground">{numbers.get(co.id)}</span>
                      <span className="ml-2 text-foreground">{co.title || "Untitled change order"}</span>
                      <span className={cn("ml-2 font-semibold tabular-nums", amountColor(Number(co.amount)))}>{signedMoney(Number(co.amount), formatCurrency)}</span>
                    </Link>
                    <div className="flex gap-1.5">
                      {co.share_token && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void copyLink(co)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copy link to resend
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setApproving(co)}>
                        <PenLine className="mr-1 h-3.5 w-3.5" /> Mark approved
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Every change order */}
          <section className="space-y-2.5">
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">All change orders</h2>
            {changeOrders.length === 0 ? (
              <div className="card-surface p-8 text-center">
                <p className="text-sm font-semibold text-foreground">No change orders yet.</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Use a change order to change something already in the job — bigger, upgraded, removed or credited. For a completely new
                  feature, add new work instead: it's priced on an add-on quote.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {newButton()}
                  <Button variant="outline" asChild>
                    <Link to={`/projects/${id}?add-new-work=1`}>
                      <FilePlus2 className="mr-1.5 h-4 w-4" /> Add new work
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              sorted.map((co) => {
                const amount = Number(co.amount);
                const reason = CHANGE_ORDER_REASONS.find((r) => r.value === co.reason)?.label;
                const featureNames = [...new Set((co.change_order_sections ?? []).map((s) => s.feature_id).filter(Boolean) as string[])]
                  .map(featureLabel)
                  .filter(Boolean) as string[];
                const coInvoices = invoicesFor.get(co.id) ?? [];
                const open = `/projects/${id}/change-orders/${co.id}`;
                return (
                  <div key={co.id} className="card-surface flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover sm:flex-row sm:items-center">
                    <Link to={open} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">{numbers.get(co.id)}</span>
                        <span className="min-w-0 truncate font-semibold text-foreground">{co.title || "Untitled change order"}</span>
                        <StatusPill meta={changeOrderStatusMeta(co.status)} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {reason && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{reason}</span>}
                        {featureNames.map((n) => (
                          <span key={n} className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">
                            {n}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{changeOrderDecisionLine(co)}</p>
                      {co.status === "approved" && (
                        <p className="mt-0.5 text-xs">
                          {amount < 0 ? (
                            <span className="text-muted-foreground">Credit — comes off what the client still owes</span>
                          ) : coInvoices.length > 0 ? (
                            <span className="text-muted-foreground">
                              Invoiced ·{" "}
                              {coInvoices.map((i) => `${i.invoice_number ?? "Invoice"} (${invoiceStatusMeta(i.status, i.amount_paid).label})`).join(", ")}
                            </span>
                          ) : (
                            <span className="font-semibold text-warning">Not invoiced yet</span>
                          )}
                        </p>
                      )}
                    </Link>
                    {/* Phones: amount and actions share a row; sm+: their own columns. */}
                    <div className="flex items-center justify-between gap-3 sm:contents">
                      <Link to={open} className="shrink-0 text-left sm:w-32 sm:text-right">
                        <div className={cn("text-base font-bold tabular-nums", amountColor(amount))}>{signedMoney(amount, formatCurrency)}</div>
                        <div className="text-[11px] text-muted-foreground">{co.schedule_impact_days ? `${days(co.schedule_impact_days)} schedule` : "No schedule change"}</div>
                      </Link>
                      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[11rem]">
                        {co.status === "draft" && (
                          <Button size="sm" variant="outline" className="h-9" asChild>
                            <Link to={open}>Finish & send</Link>
                          </Button>
                        )}
                        {co.status === "sent" && (
                          <Button size="sm" variant="outline" className="h-9" onClick={() => setApproving(co)}>
                            Mark approved
                          </Button>
                        )}
                        {changeOrderInvoiceable(co, coInvoices).ok && (
                          <Button size="sm" variant="outline" className="h-9" disabled={invoiceMut.isPending} onClick={() => invoiceMut.mutate(co)}>
                            Create invoice
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`More for ${numbers.get(co.id)}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => navigate(open)}>Open</DropdownMenuItem>
                            {co.status === "draft" && <DropdownMenuItem onSelect={() => setApproving(co)}>Mark approved</DropdownMenuItem>}
                            {co.share_token && (
                              <>
                                <DropdownMenuItem onSelect={() => void copyLink(co)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy client link
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => window.open(shareUrl(co)!, "_blank", "noopener")}>
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Client's page
                                </DropdownMenuItem>
                              </>
                            )}
                            {coInvoices.map((i) => (
                              <DropdownMenuItem key={i.id} onSelect={() => navigate(`/projects/${id}/invoices/${i.id}`)}>
                                Open invoice {i.invoice_number ?? ""}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      <ManualApprovalDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Mark ${approving ? numbers.get(approving.id) ?? "this change order" : "this change order"} approved`}
        description="The client agreed in person or on paper. Same as their approval: the contract, features, schedule and Cost plan update."
        defaultSignedBy={clientName}
        pending={approveMut.isPending}
        onSubmit={(a) => approving && approveMut.mutate({ co: approving, a })}
      />
    </div>
  );
}

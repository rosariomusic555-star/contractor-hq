import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, MoreHorizontal, PenLine, Plus, Send, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/common/StatusPill";
import { KpiCard } from "@/components/common/KpiCard";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { ManualApprovalDialog, type ManualApproval } from "@/components/common/ManualApprovalDialog";
import { QuoteActivityBadge } from "@/components/quote-activity/QuoteActivityBadge";
import { AddNewWorkDialog } from "@/components/projects/AddNewWorkDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DEPOSIT_INVOICE_NOTE,
  addFeatureQuoteSections,
  contractorApproveQuote,
  createProjectInvoice,
  createQuote,
  getNotificationSettings,
  getProject,
  listCategories,
  listInvoices,
  listQuotes,
  pickHeadlineQuote,
  projectContractValue,
  quoteTotal,
  type Quote,
} from "@/lib/api";
import { quoteStatusMeta } from "@/lib/statusMeta";
import { isProjectActive } from "@/lib/materialTracking";
import { addonQuoteNumbers } from "@/lib/featureFinancials";
import { coldLabel, coldState } from "@/lib/quoteActivity";
import { quoteDecisionLine, quoteKindLabel, quoteSummary } from "@/lib/projectBilling";

const shareUrl = (q: Pick<Quote, "share_token">) => (q.share_token ? `${window.location.origin}/quote/${q.share_token}` : null);
const MAX_SECTION_NAMES = 3;

/**
 * A project's quotes: what's signed (the contract from quotes), what's out
 * with the client and how they're engaging (views, going cold), drafts,
 * the deposit — then every quote with its kind (original / option / add-on),
 * what it covers, who signed it and how, and the quick action for its
 * state. Same look as the project's Invoices and Change orders pages.
 */
export function ProjectQuotesView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const [approving, setApproving] = useState<Quote | null>(null);

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: quotes = [], isLoading, isError, error } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: settings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });

  const won = isProjectActive(project);
  const addonNumbers = addonQuoteNumbers(quotes);
  const totalOf = (q: Quote) => quoteTotal(q.quote_sections);
  const signed = projectContractValue(quotes, []);
  const summary = quoteSummary(quotes, totalOf);
  const anySigned = quotes.some((q) => q.status === "approved");
  const headline = pickHeadlineQuote(quotes);
  const depositPct = headline?.status === "approved" ? Number(headline.deposit_percentage) || 0 : 0;
  const depositInvoice = invoices.find((i) => i.notes === DEPOSIT_INVOICE_NOTE) ?? null;
  const depositAmount = depositPct > 0 && headline ? Math.round(totalOf(headline) * depositPct) / 100 : 0;
  const waiting = quotes.filter((q) => q.status === "sent");
  // Newest first, but the signed original always leads.
  const sorted = [...quotes].sort((a, b) =>
    a.id === headline?.id && a.status === "approved" ? -1 : b.id === headline?.id && b.status === "approved" ? 1 : b.created_at.localeCompare(a.created_at),
  );
  const clientName = project?.client?.name ?? null;

  const onError = (err: Error) => toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
  const refresh = () => {
    for (const k of ["quotes", "quote", "projects", "project", "opportunities", "invoices", "project-features", "project-events", "quote-selections"]) qc.invalidateQueries({ queryKey: [k] });
  };

  // The client comes from the project; the first quote starts with one section per project feature.
  const addMut = useMutation({
    mutationFn: async () => {
      const quote = await createQuote({ project_id: id, client_id: project?.client_id ?? null });
      if (quotes.length === 0) await addFeatureQuoteSections(quote.id, id, categories);
      return quote;
    },
    onSuccess: (quote) => {
      refresh();
      navigate(`/projects/${id}/quotes/${quote.id}`);
    },
    onError,
  });
  const approveMut = useMutation({
    mutationFn: ({ q, a }: { q: Quote; a: ManualApproval }) =>
      contractorApproveQuote({
        quoteId: q.id,
        method: a.method,
        note: a.note,
        signedBy: a.signedBy,
        approvedOn: a.approvedOn,
        recordedBy: (session?.user?.user_metadata?.full_name as string | undefined) || session?.user?.email || "Contractor",
      }),
    onSuccess: () => {
      setApproving(null);
      refresh();
      toast({ title: "Quote approved", description: "The job is Won — same as a client approval in the Client Hub." });
    },
    onError,
  });
  const depositMut = useMutation({
    mutationFn: () => createProjectInvoice(id, "deposit"),
    onSuccess: (invoice) => {
      refresh();
      navigate(`/projects/${id}/invoices/${invoice.id}`);
    },
    onError,
  });

  const copyLink = async (q: Quote) => {
    const url = shareUrl(q);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it in a text or email to the client." });
    } catch {
      toast({ title: "Couldn't copy", description: url });
    }
  };

  if (isLoading) return <p className="text-muted-foreground">Loading quotes…</p>;
  if (isError || !project) return <p className="text-destructive">Failed to load quotes: {(error as Error)?.message}</p>;

  // Once the job is Won, another quote is new work: an add-on (0108). Before
  // that, another quote is a revision / option.
  const primary = (full = false) =>
    won ? (
      <Button onClick={() => setAddWorkOpen(true)} className={cn("font-bold", full && "h-11 w-full")}>
        <Plus className="mr-1.5 h-4 w-4" /> Add new work
      </Button>
    ) : (
      <Button onClick={() => addMut.mutate()} disabled={addMut.isPending} className={cn("font-bold", full && "h-11 w-full")}>
        <Plus className="mr-1.5 h-4 w-4" /> {addMut.isPending ? "Creating…" : quotes.length ? "Add an option" : "New quote"}
      </Button>
    );

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-5">
      <MobilePageHeader
        className="mobile-header-ink"
        title="Quotes"
        subtitle={[project.name, clientName].filter(Boolean).join(" · ")}
        back={{ to: `/projects/${id}`, label: "Project" }}
        pills={waiting.length > 0 ? <span className="badge-status !bg-white/20 !text-sidebar-foreground">{waiting.length} with the client</span> : undefined}
      />

      <div className="hidden md:block">
        <BackLink to={`/projects/${id}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Back to project
        </BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-subtle">Quotes</div>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-foreground">{project.name}</h1>
            {clientName && <p className="mt-1 text-sm text-muted-foreground">{clientName}</p>}
          </div>
          {primary()}
        </div>
      </div>
      <div className="md:hidden">{primary(true)}</div>
      <AddNewWorkDialog open={addWorkOpen} onOpenChange={setAddWorkOpen} projectId={id} clientId={project.client_id ?? null} />

      {/* Where the quotes stand */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Signed"
          value={anySigned ? formatCurrency(signed) : "—"}
          sub={anySigned ? (quotes.some((q) => q.kind === "addon" && q.status === "approved") ? "original + approved add-ons" : "the signed quote") : "nothing signed yet"}
          subTone={anySigned ? "positive" : "muted"}
        />
        <KpiCard
          label="With the client"
          value={summary.sent.count ? formatCurrency(summary.sent.total) : "—"}
          sub={summary.sent.count ? `${summary.sent.count} waiting on a signature` : "nothing out"}
        />
        <KpiCard label="Drafts" value={summary.drafts.count ? formatCurrency(summary.drafts.total) : "—"} sub={summary.drafts.count ? `${summary.drafts.count} not sent yet` : "none"} />
        <KpiCard
          label="Deposit"
          value={depositPct > 0 ? formatCurrency(depositAmount) : "—"}
          sub={depositPct > 0 ? (depositInvoice ? `${depositPct}% · invoiced ${depositInvoice.invoice_number ?? ""}`.trim() : `${depositPct}% · not invoiced yet`) : "after a quote is signed"}
          subTone={depositAmount > 0 && !depositInvoice ? "negative" : "muted"}
        />
      </div>

      {/* With the client */}
      {waiting.length > 0 && (
        <section className="rounded-card border border-info/40 bg-info/5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Send className="h-4 w-4 text-info" /> With the client
          </h3>
          <ul className="mt-2 divide-y divide-hairline">
            {waiting.map((q) => {
              const cold = settings ? coldState(q, settings) : null;
              return (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to={`/projects/${id}/quotes/${q.id}`} className="min-w-0 text-sm hover:underline">
                    <span className="font-semibold text-foreground">{quoteKindLabel(q, quotes, addonNumbers)}</span>
                    <span className="ml-2 font-semibold tabular-nums text-foreground">{formatCurrency(totalOf(q))}</span>
                    <span className={cn("ml-2", cold ? "text-info" : "text-muted-foreground")}>
                      {cold ? (
                        <span className="inline-flex items-center gap-1">
                          <Snowflake className="h-3.5 w-3.5" /> {coldLabel(cold)}
                        </span>
                      ) : (
                        quoteDecisionLine(q)
                      )}
                    </span>
                  </Link>
                  <div className="flex gap-1.5">
                    {q.share_token && (
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void copyLink(q)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copy link to resend
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setApproving(q)}>
                      <PenLine className="mr-1 h-3.5 w-3.5" /> Mark approved
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Every quote */}
      <section className="space-y-2.5">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">All quotes</h2>
        {quotes.length === 0 ? (
          <div className="card-surface p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No quotes yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">The first quote starts with a section for each of the project's features.</p>
            <div className="mt-4 flex justify-center">{primary()}</div>
          </div>
        ) : (
          sorted.map((q) => {
            const open = `/projects/${id}/quotes/${q.id}`;
            const names = (q.quote_sections ?? []).map((s) => s.name).filter(Boolean);
            const isSignedOriginal = q.status === "approved" && q.kind !== "addon";
            return (
              <div key={q.id} className="card-surface flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover sm:flex-row sm:items-center">
                <Link to={open} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{quoteKindLabel(q, quotes, addonNumbers)}</span>
                    <StatusPill meta={quoteStatusMeta(q.status)} />
                    <QuoteActivityBadge quote={q} settings={settings} showLastViewed={false} />
                  </div>
                  {names.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {names.slice(0, MAX_SECTION_NAMES).map((n, i) => (
                        <span key={i} className="max-w-[16rem] truncate rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {n}
                        </span>
                      ))}
                      {names.length > MAX_SECTION_NAMES && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">+{names.length - MAX_SECTION_NAMES} more</span>
                      )}
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{quoteDecisionLine(q)}</p>
                </Link>
                {/* Phones: amount and actions share a row; sm+: their own columns. */}
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <Link to={open} className="shrink-0 text-left sm:w-32 sm:text-right">
                    <div className="text-base font-bold tabular-nums text-foreground">{formatCurrency(totalOf(q))}</div>
                    {Number(q.deposit_percentage) > 0 && q.kind !== "addon" && <div className="text-[11px] text-muted-foreground">{Number(q.deposit_percentage)}% deposit</div>}
                  </Link>
                  <div className="flex shrink-0 items-center justify-end gap-1.5 sm:w-[11rem]">
                    {q.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-9" asChild>
                        <Link to={open}>Finish & send</Link>
                      </Button>
                    )}
                    {q.status === "sent" && (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setApproving(q)}>
                        Mark approved
                      </Button>
                    )}
                    {isSignedOriginal && depositAmount > 0 && !depositInvoice && (
                      <Button size="sm" variant="outline" className="h-9" disabled={depositMut.isPending} onClick={() => depositMut.mutate()}>
                        Deposit invoice
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`More for ${quoteKindLabel(q, quotes, addonNumbers)}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(open)}>Open</DropdownMenuItem>
                        {q.status === "draft" && <DropdownMenuItem onSelect={() => setApproving(q)}>Mark approved</DropdownMenuItem>}
                        {q.share_token && (
                          <>
                            <DropdownMenuItem onSelect={() => void copyLink(q)}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Copy client link
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.open(shareUrl(q)!, "_blank", "noopener")}>
                              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Client's page (print / PDF)
                            </DropdownMenuItem>
                          </>
                        )}
                        {isSignedOriginal && depositInvoice && (
                          <DropdownMenuItem onSelect={() => navigate(`/projects/${id}/invoices/${depositInvoice.id}`)}>Open deposit invoice</DropdownMenuItem>
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

      <ManualApprovalDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title="Mark this quote approved"
        description="Does everything a client approval does: locks the selections, marks the job Won and schedules it, and drafts the deposit invoice."
        defaultSignedBy={clientName}
        pending={approveMut.isPending}
        onSubmit={(a) => approving && approveMut.mutate({ q: approving, a })}
      />
    </div>
  );
}

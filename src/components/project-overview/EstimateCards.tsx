import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, ExternalLink, FileDown, History, MoreHorizontal, Plus, Printer, Send } from "lucide-react";
import {
  contractorApproveChangeOrder,
  generateShareLink,
  getNotificationSettings,
  listDocumentVersionCounts,
  logProjectEvent,
  quoteTotal,
  updateChangeOrder,
  type ChangeOrder,
  type MaterialsSection,
  type Project,
  type Quote,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill } from "@/components/common/StatusPill";
import { useProjectStyling } from "@/hooks/use-project-styling";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { ManualApprovalDialog, type ManualApproval } from "@/components/common/ManualApprovalDialog";
import { QuoteActivityBadge } from "@/components/quote-activity/QuoteActivityBadge";
import { useToast } from "@/hooks/use-toast";
import { useRecorderName } from "@/hooks/use-recorder-name";
import { COST_BUCKETS, COST_TYPE_GROUP_LABEL, type CostTotals } from "@/lib/costPlanMath";
import { addonQuoteNumbers, changeOrderNumbers } from "@/lib/featureFinancials";
import { featureName, type ProjectFeature } from "@/lib/features";
import { isProjectActive } from "@/lib/materialTracking";
import { quoteDecisionLine, quoteKindLabel } from "@/lib/projectBilling";
import { marginPct, type FeatureProfitRow } from "@/lib/projectOverview";
import { changeOrderStatusMeta, quoteStatusMeta } from "@/lib/statusMeta";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { CardEmpty, OverviewCard } from "./OverviewCard";
import type { OverviewMoney } from "./NewOverview";

const money = (v: number) => formatCurrency(v);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length > 10 ? iso : `${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/** Colors for the planned-by-type bar — the app's own tokens, calm. */
const BUCKET_COLOR: Record<string, string> = {
  material: "bg-primary",
  labor: "bg-info",
  subcontractor: "bg-warning",
  equipment: "bg-muted-foreground/60",
  other: "bg-border",
};

// --- Cost plan ----------------------------------------------------------------

/**
 * Cost plan at a glance — total planned (and actual once work starts), the
 * planned margin (fully loaded too when overhead is set up), planned cost
 * by type, and a row per feature (planned · price · margin). Numbers come
 * from the same report as the Overview / Money tab (jobCostReport) and the
 * Cost plan's own totals (costPlanSummary), so they always match.
 */
export function CostPlanCard({
  projectId,
  project,
  hasSheet,
  planned,
  money: m,
  sections,
  features,
  categories,
}: {
  projectId: string;
  project: Project;
  hasSheet: boolean;
  /** costPlanSummary(...).planned — the Cost plan's own totals by type. */
  planned: CostTotals;
  money: OverviewMoney | null;
  sections: MaterialsSection[];
  features: ProjectFeature[];
  categories: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const base = `/projects/${projectId}/materials`;
  const started = isProjectActive(project) && (project.status === "in_progress" || !!project.actual_start_date || project.status === "complete");
  const sectionByFeature = new Map(sections.filter((s) => s.feature_id).map((s) => [s.feature_id!, s.id]));
  const calcSections = sections.filter((s) => s.smart_section_build_type);
  const [showAll, setShowAll] = useState(false);

  if (!hasSheet) {
    return (
      <OverviewCard title="Cost plan" headerTo={base} links={[{ label: "Open", to: base }]}>
        <CardEmpty text="No cost plan yet." action={{ label: "Create cost plan", to: base }} />
      </OverviewCard>
    );
  }

  const price = m?.total.price ?? 0;
  const plannedMargin = m ? marginPct(m.report.profit.expected, price) : null;
  const loadedMargin = m && m.report.profit.expectedFullyLoaded != null ? marginPct(m.report.profit.expectedFullyLoaded, price) : null;
  const rows = (m?.rows ?? []).filter((r) => r.kind !== "labor");
  const shownRows = showAll ? rows : rows.slice(0, 6);
  const buckets = COST_BUCKETS.filter((b) => planned[b] > 0.004);
  const featureLabel = (r: FeatureProfitRow) => {
    const f = r.featureId ? features.find((x) => x.id === r.featureId) : null;
    return f ? featureName(f, categories) : r.name;
  };

  return (
    <OverviewCard title="Cost plan" headerTo={base} links={[{ label: "Open cost plan", to: base }]} status={m ? "ready" : "loading"} skeletonRows={5}>
      {/* Totals */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Planned cost</p>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{money(planned.total)}</p>
        </div>
        {started && m && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Actual to date</p>
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{money(m.report.actual)}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {plannedMargin != null && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">{pct(plannedMargin)} planned margin</span>
          )}
          {loadedMargin != null && (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{pct(loadedMargin)} fully loaded</span>
          )}
        </div>
      </div>

      {/* Planned cost by type */}
      {planned.total > 0 && (
        <div className="mt-4">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Planned cost by type">
            {buckets.map((b) => (
              <div key={b} className={BUCKET_COLOR[b]} style={{ width: `${(planned[b] / planned.total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {buckets.map((b) => (
              <li key={b} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", BUCKET_COLOR[b])} />
                {COST_TYPE_GROUP_LABEL[b]} <span className="font-semibold tabular-nums text-foreground">{money(planned[b])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per feature */}
      {rows.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
            <span>Feature</span>
            <span className="text-right">Planned</span>
            <span className="hidden text-right sm:block">Price</span>
            <span className="text-right">Margin</span>
          </div>
          <ul>
            {shownRows.map((r) => {
              const sid = r.featureId ? sectionByFeature.get(r.featureId) : undefined;
              return (
                <li key={r.key}>
                  <Link
                    to={sid ? `${base}#section-${sid}` : base}
                    className="grid min-h-11 grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 rounded-md px-1 py-1.5 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{featureLabel(r)}</span>
                      {started && r.overPlan > 0.004 && (
                        <span className="block text-[11px] text-muted-foreground">
                          Actual {money(r.actual)} · +{money(r.overPlan)} over plan
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums text-foreground">{money(r.planned)}</span>
                    <span className="hidden text-right tabular-nums text-muted-foreground sm:block">{r.price ? money(r.price) : "—"}</span>
                    <span className="text-right tabular-nums">
                      {r.margin == null ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-muted-subtle" aria-label={r.marginWhy}>—</span>
                          </TooltipTrigger>
                          <TooltipContent>{r.marginWhy}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="font-semibold text-foreground">{pct(r.margin)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > 6 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 min-h-9 px-1 text-sm font-semibold text-primary hover:underline">
              {showAll ? "Show fewer" : `+${rows.length - 6} more`}
            </button>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
        <Button size="sm" variant="outline" className="h-9" asChild>
          <Link to={base}>Open cost plan</Link>
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => navigate(`${base}#order-sheet`)}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" /> Request supplier quote
        </Button>
        {calcSections.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-9">
                <Calculator className="mr-1.5 h-3.5 w-3.5" /> Calculate quantities
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Which section?</p>
              {calcSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`${base}#calc-${s.id}`)}
                  className="flex min-h-10 w-full items-center rounded-md px-2 text-left text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {s.name || "Section"}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
        <Button size="sm" variant="ghost" className="h-9" onClick={() => navigate(`${base}#add-section`)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add section
        </Button>
      </div>
    </OverviewCard>
  );
}

// --- Quotes -------------------------------------------------------------------

const shareUrlOf = (token: string) => `${window.location.origin}/quote/${token}`;

function selectionsLine(q: Quote): string | null {
  const groups = (q.quote_sections ?? []).flatMap((s) => s.quote_selection_groups ?? []);
  if (groups.length === 0) return null;
  const chosen = groups.filter((g) => (g.quote_selection_picks?.length ?? 0) > 0 || !!g.approved_at).length;
  if (q.status === "sent" && chosen < groups.length) return `Waiting on client: ${groups.length - chosen} of ${pluralize(groups.length, "selection")}`;
  return `Selections: ${chosen} of ${groups.length} chosen`;
}

/**
 * Every quote on the job (original, options, add-ons): status, revision,
 * total, how the client's engaging, selections, and its actions — Open,
 * Preview as client, Print / PDF, Send / Resend, Versions.
 */
export function QuotesCard({ projectId, project, quotes }: { projectId: string; project: Project; quotes: Quote[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });
  const versionsQ = useQuery({ queryKey: ["document-version-counts", projectId], queryFn: () => listDocumentVersionCounts(projectId) });
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const addonNumbers = addonQuoteNumbers(quotes);
  const won = isProjectActive(project);
  const sorted = [...quotes].sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved") || b.created_at.localeCompare(a.created_at));
  const approvedTotal = quotes.filter((q) => q.status === "approved").reduce((s, q) => s + quoteTotal(q.quote_sections), 0);
  const base = `/projects/${projectId}/quotes`;

  const ensureLink = useMutation({
    mutationFn: async (q: Quote) => q.share_token ?? (await generateShareLink("quotes", q.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => toast({ title: "Couldn't get the client link", description: err.message, variant: "destructive" }),
  });
  const previewAsClient = async (q: Quote) => {
    const token = await ensureLink.mutateAsync(q);
    window.open(shareUrlOf(token), "_blank", "noopener");
  };

  return (
    <OverviewCard
      title="Quotes"
      headerTo={base}
      links={[{ label: "Open", to: base }]}
      className="h-full"
    >
      {quotes.length === 0 ? (
        <CardEmpty text="No quotes yet." action={{ label: "Open quotes", to: base }} />
      ) : (
        <>
          <ul className="-mx-1 divide-y divide-hairline">
            {sorted.map((q) => {
              const open = `${base}/${q.id}`;
              const rev = versionsQ.data?.get(q.id) ?? 0;
              const sel = selectionsLine(q);
              const docPage = `/projects/${projectId}/client-view/documents/quote/${q.id}`;
              const label = quoteKindLabel(q, quotes, addonNumbers);
              return (
                <li key={q.id} className="flex items-start gap-2 px-1 py-2.5">
                  <Link to={open} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="title-row flex flex-wrap items-center gap-1.5">
                      <span className="item-title text-sm font-semibold text-foreground">{label}</span>
                      <StatusPill meta={quoteStatusMeta(q.status)} />
                      {rev > 1 && <span className="text-[11px] font-semibold text-muted-foreground">Rev {rev}</span>}
                      <QuoteActivityBadge quote={q} settings={settings} showLastViewed={false} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{quoteDecisionLine(q)}</span>
                    {sel && <span className="block text-xs text-muted-foreground">{sel}</span>}
                  </Link>
                  <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-foreground">{money(quoteTotal(q.quote_sections))}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Actions for ${label}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => navigate(open)}>Open</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void previewAsClient(q)}>
                        <ExternalLink className="mr-2 h-3.5 w-3.5" /> Preview as client
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate(docPage)}>
                        <Printer className="mr-2 h-3.5 w-3.5" /> Print / PDF
                      </DropdownMenuItem>
                      {q.status === "draft" && (
                        <DropdownMenuItem onSelect={() => navigate(open)}>
                          <Send className="mr-2 h-3.5 w-3.5" /> Finish & send
                        </DropdownMenuItem>
                      )}
                      {q.status === "sent" && q.share_token && (
                        <DropdownMenuItem onSelect={() => setShareUrl(shareUrlOf(q.share_token!))}>
                          <Send className="mr-2 h-3.5 w-3.5" /> Resend link
                        </DropdownMenuItem>
                      )}
                      {rev > 1 && (
                        <DropdownMenuItem onSelect={() => navigate(docPage)}>
                          <History className="mr-2 h-3.5 w-3.5" /> Version history
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5 text-sm">
            <span className="text-muted-foreground">
              Approved <span className="font-bold tabular-nums text-foreground">{money(approvedTotal)}</span>
            </span>
            {won && (
              <Link to={`/projects/${projectId}?tab=change-orders&add-new-work=1`} className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add-on quote
              </Link>
            )}
          </div>
        </>
      )}
      <ShareLinkDialog open={!!shareUrl} onOpenChange={(o) => !o && setShareUrl(null)} url={shareUrl ?? ""} kind="quote" />
    </OverviewCard>
  );
}

// --- Change orders --------------------------------------------------------------

const coShareUrl = (token: string) => `${window.location.origin}/change-order/${token}`;
const coTotal = (co: ChangeOrder) =>
  (co.change_order_sections ?? []).reduce((a, s) => a + (s.change_order_items ?? []).reduce((b, i) => b + Number(i.price) * (i.quantity == null ? 1 : Number(i.quantity)), 0), 0);

/**
 * Change orders: what's approved and pending (net effect on the contract),
 * one row per CO with the feature it changes, amount, status, date, and its
 * next step — Send to client / Resend / Mark approved — using the same calls
 * as the change order page.
 */
export function ChangeOrdersCard({
  projectId,
  project,
  changeOrders,
  features,
  categories,
  contractValue,
  onNew,
}: {
  projectId: string;
  project: Project;
  changeOrders: ChangeOrder[];
  /** projectContractValue — original + add-ons + approved change orders. */
  contractValue: number;
  features: ProjectFeature[];
  categories: { id: string; name: string }[];
  onNew: () => void;
}) {
  // Updated styling: "+ New change order" is the card's one filled action.
  const [updatedStyling] = useProjectStyling();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const recordedBy = useRecorderName();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [approving, setApproving] = useState<ChangeOrder | null>(null);
  const [showAll, setShowAll] = useState(false);
  const numbers = changeOrderNumbers(changeOrders);
  const sorted = [...changeOrders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const approved = changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount || 0), 0);
  const pending = changeOrders.filter((c) => c.status === "sent" || c.status === "draft");
  const pendingTotal = pending.reduce((s, c) => s + (Number(c.amount || 0) || coTotal(c)), 0);
  const base = `/projects/${projectId}/change-orders`;
  const featureOf = (co: ChangeOrder) => {
    const ids = [...new Set((co.change_order_sections ?? []).map((s) => s.feature_id).filter(Boolean))] as string[];
    const names = ids.map((id) => features.find((f) => f.id === id)).filter(Boolean).map((f) => featureName(f!, categories));
    return names.join(", ");
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["change-orders"] });
    qc.invalidateQueries({ queryKey: ["project-events", projectId] });
  };

  // Same as the change order page's Send: share link, status Sent, timeline.
  const sendMut = useMutation({
    mutationFn: async (co: ChangeOrder) => {
      const token = co.share_token ?? (await generateShareLink("change_orders", co.id));
      await updateChangeOrder(co.id, { status: "sent" });
      return { token, co };
    },
    onSuccess: ({ token, co }) => {
      refresh();
      void logProjectEvent(projectId, "change_order_sent", `Change order sent · ${formatCurrency(Number(co.amount || 0))}`);
      setShareUrl(coShareUrl(token));
    },
    onError: (err: Error) => toast({ title: "Couldn't send", description: err.message, variant: "destructive" }),
  });
  const approveMut = useMutation({
    mutationFn: ({ co, a }: { co: ChangeOrder; a: ManualApproval }) =>
      contractorApproveChangeOrder({ changeOrderId: co.id, method: a.method, note: a.note, signedBy: a.signedBy, approvedOn: a.approvedOn, recordedBy }),
    onSuccess: () => {
      setApproving(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Change order approved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't approve", description: err.message, variant: "destructive" }),
  });

  const shown = showAll ? sorted : sorted.slice(0, 5);
  return (
    <OverviewCard title="Change orders" headerTo={base} links={[{ label: "Open", to: base }]} className="h-full">
      {changeOrders.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No change orders yet. Use one when the client changes something already in the job — bigger, upgraded, removed or credited.</p>
          <Button size="sm" variant={updatedStyling ? "default" : "outline"} className="h-9" onClick={onNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New change order
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-bold tabular-nums text-foreground">
              {approved >= 0 ? "+" : "−"}
              {money(Math.abs(approved))}
            </span>{" "}
            approved
            {pending.length > 0 && (
              <>
                {" "}· {pending.length} pending ({pendingTotal >= 0 ? "+" : "−"}
                {money(Math.abs(pendingTotal))})
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Contract now <span className="font-semibold tabular-nums text-foreground">{money(contractValue)}</span> with approved change orders
          </p>
          <ul className="-mx-1 mt-2 divide-y divide-hairline">
            {shown.map((co) => {
              const amount = Number(co.amount || 0) || coTotal(co);
              const when = co.status === "approved" ? co.approved_at : co.created_at;
              const label = `CO-${String(numbers.get(co.id) ?? 0).padStart(3, "0")}`;
              const feat = featureOf(co);
              return (
                <li key={co.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 py-2.5">
                  <Link to={`${base}/${co.id}`} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="title-row flex flex-wrap items-center gap-1.5">
                      <span className="item-title text-sm font-semibold text-foreground">
                        {label}
                        {co.title ? ` · ${co.title}` : ""}
                      </span>
                      <StatusPill meta={changeOrderStatusMeta(co.status)} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[feat, shortDate(when)].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                    {amount >= 0 ? "+" : "−"}
                    {money(Math.abs(amount))}
                  </span>
                  {(co.status === "draft" || co.status === "sent") && (
                    <div className="flex w-full justify-end gap-1.5">
                      {co.status === "draft" ? (
                        <Button size="sm" variant="outline" className="h-9" disabled={sendMut.isPending || !co.title || amount === 0} onClick={() => sendMut.mutate(co)} title={!co.title || amount === 0 ? "Add a title and a priced line first" : undefined}>
                          <Send className="mr-1 h-3.5 w-3.5" /> Send to client
                        </Button>
                      ) : (
                        co.share_token && (
                          <Button size="sm" variant="ghost" className="h-9" onClick={() => setShareUrl(coShareUrl(co.share_token!))}>
                            Resend
                          </Button>
                        )
                      )}
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setApproving(co)}>
                        Mark approved
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
            {sorted.length > 5 ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="min-h-9 text-sm font-semibold text-primary hover:underline">
                {showAll ? "Show fewer" : `View all ${sorted.length}`}
              </button>
            ) : (
              <span />
            )}
            <Button size="sm" variant={updatedStyling ? "default" : "outline"} className="h-9" onClick={onNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New change order
            </Button>
          </div>
        </>
      )}
      <ShareLinkDialog open={!!shareUrl} onOpenChange={(o) => !o && setShareUrl(null)} url={shareUrl ?? ""} kind="change order" />
      <ManualApprovalDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title="Mark this change order approved"
        description="The client agreed in person or on paper. Same as their approval: the contract, features, schedule and Cost plan update."
        defaultSignedBy={project.client?.name ?? null}
        pending={approveMut.isPending}
        onSubmit={(a) => approving && approveMut.mutate({ co: approving, a })}
      />
    </OverviewCard>
  );
}

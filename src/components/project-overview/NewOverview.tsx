import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Eye, Mail, MapPin, Navigation, Pencil, Phone, Send } from "lucide-react";
import {
  getClient,
  getSignedImageUrls,
  listProgressUpdates,
  listProjectImages,
  listTasks,
  setTaskCompleted,
  type ChangeOrder,
  type Invoice,
  type Project,
  type ProjectEvent,
  type Quote,
} from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMaterialsCenter } from "@/hooks/use-materials-center";
import { useNeedsYouItems } from "@/components/dashboard/useNeedsYouItems";
import { usePreconBundle } from "@/components/precon/usePrecon";
import { preconPhase } from "@/lib/precon";
import { overEstimate } from "@/lib/materialTracking";
import { remainingToInvoice } from "@/lib/projectMoney";
import { projectHref, type ProjectTab } from "@/lib/projectTabs";
import {
  buildNextActions,
  overviewStage,
  projectNeedsYou,
  recentUpdates,
  timeElapsed,
  type FeatureProfitRow,
  type NextAction,
  type OverviewStage,
} from "@/lib/projectOverview";
import type { JobCostReport } from "@/lib/jobCosts";
import { timeAgo } from "@/lib/time";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { CardEmpty, FactRow, OverviewCard, ThinBar, type CardLink } from "./OverviewCard";

const money = (v: number) => formatCurrency(v);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export interface OverviewMoney {
  report: JobCostReport;
  rows: FeatureProfitRow[];
  total: { price: number; planned: number; actual: number; profit: number; margin: number | null };
  /** Complete + delivered material counted — the numbers are final. */
  final: boolean;
}

// --- Header -------------------------------------------------------------------

/**
 * The New overview's compact header: "Project · <status>", name, client ·
 * address, the first few feature chips (+N expands inline; Edit opens the
 * existing picker), and on the right Contract value + Projected margin (both
 * open Money). The stage banner, readiness line and pipeline link come in as
 * `below`.
 */
export function NewOverviewHeader({
  project,
  statusLabel,
  contract,
  margin,
  marginLabel,
  featureNames,
  featureEditor,
  statusSelect,
  onMoney,
  below,
}: {
  project: Project;
  statusLabel: string;
  contract: number;
  margin: number | null;
  marginLabel: string;
  featureNames: string[];
  featureEditor: ReactNode;
  statusSelect: ReactNode;
  onMoney: () => void;
  below: ReactNode;
}) {
  const [allChips, setAllChips] = useState(false);
  const [editing, setEditing] = useState(false);
  const shown = allChips ? featureNames : featureNames.slice(0, 4);
  const more = featureNames.length - shown.length;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-subtle">Project · {statusLabel}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-[28px]">{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            {project.client_id && project.client ? (
              <Link to={`/clients/${project.client_id}`} className="font-semibold text-foreground hover:underline">
                {project.client.name}
              </Link>
            ) : (
              <span>No client</span>
            )}
            {project.address && (
              <span className="inline-flex min-w-0 items-center gap-1">
                · <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{project.address}</span>
              </span>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {shown.map((n) => (
              <span key={n} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                {n}
              </span>
            ))}
            {more > 0 && (
              <button type="button" onClick={() => setAllChips(true)} className="min-h-7 rounded-full border border-dashed border-border px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                +{more} more
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-expanded={editing}
              aria-label="Edit features"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-subtle hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {editing && <div className="mt-2 w-full md:w-2/3">{featureEditor}</div>}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <div className="flex items-center gap-3 sm:justify-end">
            <button type="button" onClick={onMoney} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-subtle">Contract value</span>
              <span className="block text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{contract > 0 ? money(contract) : "—"}</span>
            </button>
            {margin != null && (
              <button
                type="button"
                onClick={onMoney}
                className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`${marginLabel} — open Money`}
              >
                {pct(margin)} <span className="font-semibold text-muted-foreground">{marginLabel.toLowerCase()}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 sm:justify-end">
            {statusSelect}
          </div>
        </div>
      </div>
      {below}
    </header>
  );
}

// --- Body ---------------------------------------------------------------------

export function NewOverview({
  project,
  crewName,
  weatherDays,
  contract,
  paid,
  remaining,
  overpaid,
  quotes,
  changeOrders,
  invoices,
  events,
  money: m,
  extras,
  onInviteToHub,
  invitePending,
  goTab,
}: {
  project: Project;
  crewName: string | null;
  weatherDays: number;
  contract: number;
  paid: number;
  remaining: number;
  overpaid: number;
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  invoices: Invoice[];
  events: ProjectEvent[];
  money: OverviewMoney | null;
  /** Deposit / schedule actions the page already knows how to do. */
  extras: NextAction[];
  onInviteToHub: () => void;
  invitePending: boolean;
  goTab: (t: ProjectTab) => void;
}) {
  const id = project.id;
  const stage = overviewStage(project);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Next actions: this project's Needs you items + open readiness + tasks.
  const needsYou = useNeedsYouItems();
  const { data: precon, isLoading: preconLoading } = usePreconBundle(id);
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const completeTask = useMutation({
    mutationFn: (taskId: string) => setTaskCompleted(taskId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) => toast({ title: "Couldn't complete that task", description: err.message, variant: "destructive" }),
  });
  const readiness = precon && preconPhase(precon.project) === "before" ? precon.readiness : null;
  const actions = useMemo(() => {
    const related = [...quotes.map((q) => q.id), ...invoices.map((i) => i.id), ...changeOrders.map((c) => c.id)];
    // Deposit / schedule steps belong before and during the job, never after.
    const allExtras = stage === "after" ? [] : [...extras];
    if (stage === "after" && remainingToInvoice(contract, invoices) > 0.01)
      allExtras.push({ key: "final-invoice", title: "Send the final invoice", detail: `${money(remainingToInvoice(contract, invoices))} not invoiced yet`, href: `/projects/${id}/invoices` });
    const hasDeposit = extras.some((e) => e.key === "deposit");
    return buildNextActions({
      projectId: id,
      needsYou: projectNeedsYou(needsYou.items, id, related),
      preconOpen: (readiness?.openRequired ?? [])
        .filter((v) => !(hasDeposit && v.item.kind === "deposit"))
        .map((v) => ({ key: v.item.id, label: v.item.label, detail: v.detail || undefined })),
      tasks: tasksQ.data ?? [],
      extras: allExtras,
    });
  }, [needsYou.items, readiness, tasksQ.data, extras, stage, contract, invoices, quotes, changeOrders, id]);
  const [allActions, setAllActions] = useState(false);
  const actionsLoading = needsYou.isLoading || preconLoading || tasksQ.isLoading;

  // Materials.
  const mc = useMaterialsCenter(id);
  const usageRows = (mc?.report.lines ?? []).filter((l) => l.tracked && l.used > 0);
  const nextDelivery = mc?.report.summary.nextDelivery ?? null;

  // Client.
  const clientQ = useQuery({ queryKey: ["client", project.client_id], queryFn: () => getClient(project.client_id!), enabled: !!project.client_id });
  const client = clientQ.data;
  const hub = !client ? null : client.portal_last_sign_in_at ? "active" : client.portal_invited_at ? "invited" : "none";

  // Recent updates.
  const progressQ = useQuery({ queryKey: ["progress-updates", id], queryFn: () => listProgressUpdates(id) });
  const imagesQ = useQuery({ queryKey: ["project-images", id], queryFn: () => listProjectImages(id) });
  const updates = recentUpdates({ progress: progressQ.data ?? [], images: imagesQ.data ?? [], events });
  const photoPaths = [...new Set(updates.flatMap((u) => u.photoPaths))];
  const { data: urls = {} } = useQuery({
    queryKey: ["overview-photo-urls", photoPaths.join(",")],
    queryFn: () => getSignedImageUrls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60_000,
  });

  const te = timeElapsed(project, weatherDays);
  const profitWord = m?.final ? "Final" : "Projected";
  const scheduleTab = projectHref(id, "schedule");
  const approvedQuote = quotes.find((q) => q.status === "approved" && q.kind !== "addon");
  const sectionByFeature = new Map((mc?.sections ?? []).filter((s) => s.feature_id).map((s) => [s.feature_id!, s.id]));
  const laborPending = m?.report.labor.pendingCost ?? 0;

  // ---- cards
  const health = (
    <OverviewCard title="Project health" links={[{ label: "Schedule", to: scheduleTab }]} className="order-2 lg:order-none">
      <div className="space-y-1">
        {stage === "before" || stage === "estimating" ? (
          project.scheduled_start_date ? (
            <FactRow label="Scheduled" value={`${shortDate(project.scheduled_start_date)} – ${shortDate(project.scheduled_end_date)}`} />
          ) : (
            <CardEmpty text="No schedule dates yet." action={{ label: "Add schedule", to: projectHref(id, "schedule", { then: "schedule" }) }} />
          )
        ) : (
          <FactRow
            label={stage === "after" ? "Ran" : "Started"}
            value={
              stage === "after"
                ? `${shortDate(project.actual_start_date)} – ${shortDate(project.actual_end_date)}`
                : `${shortDate(project.actual_start_date)}${project.scheduled_end_date ? ` · due ${shortDate(project.scheduled_end_date)}` : ""}`
            }
          />
        )}
        <FactRow label="Crew" value={crewName ?? <span className="font-normal text-muted-foreground">Not assigned</span>} />
        {te.kind === "no_estimate" ? (
          <CardEmpty text="No estimated duration." action={{ label: "Set estimated duration", to: scheduleTab }} />
        ) : (
          <FactRow label="Estimated duration" value={pluralize(te.estimate, "working day")} />
        )}
      </div>

      {te.kind === "elapsed" && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Time elapsed</p>
          <p className="mt-1 text-sm tabular-nums text-foreground">
            {te.elapsed} of {pluralize(te.estimate, "estimated working day")}
            {te.overDays > 0 ? "" : ` · ${te.pct}%`}
          </p>
          <ThinBar pct={te.pct} className="mt-2" />
          {te.overDays > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{pluralize(te.overDays, "day")} over estimate</p>}
          {te.weatherDays > 0 && <p className="mt-0.5 text-xs text-muted-foreground">+{pluralize(te.weatherDays, "weather day")}, not counted as over</p>}
        </div>
      )}
      {te.kind === "final" && (
        <p className="mt-3 border-t border-hairline pt-3 text-sm text-foreground">
          Took {pluralize(te.total, "working day")} of {te.estimate} estimated
          {te.diffDays > 0 ? ` · ${pluralize(te.diffDays, "day")} over` : te.diffDays < 0 ? ` · ${pluralize(-te.diffDays, "day")} early` : " · on estimate"}
        </p>
      )}
      {(stage === "before") && readiness && (
        <Link to={`${scheduleTab}#precon`} className="mt-3 flex min-h-9 items-center gap-2 border-t border-hairline pt-3 text-sm text-muted-foreground hover:text-foreground">
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          Pre-construction · {readiness.status === "ready" ? "Ready" : `${readiness.done} of ${readiness.total} ready`}
        </Link>
      )}
      {stage !== "before" && stage !== "estimating" && (
        <div className="mt-3 border-t border-hairline pt-3">
          {m ? (
            <FactRow
              label={m.final ? "Final cost" : stage === "after" ? "Cost to date" : "Spent to date"}
              value={
                <button type="button" onClick={() => goTab("money")} className="inline-flex min-h-11 items-center font-semibold text-foreground hover:underline md:min-h-0">
                  {money(m.report.actual)}
                  {stage === "after" && <span className="ml-1 font-normal text-muted-foreground">of {money(m.report.planned)} planned</span>}
                </button>
              }
            />
          ) : (
            <FactRow label="Spent to date" value="…" />
          )}
        </div>
      )}
    </OverviewCard>
  );

  const shownActions = allActions ? actions : actions.slice(0, 5);
  const nextActions = (
    <OverviewCard title="Next actions" status={actionsLoading ? "loading" : tasksQ.isError ? "error" : "ready"} onRetry={() => tasksQ.refetch()} className="order-1 lg:order-none">
      {actions.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-success" /> You're all caught up
        </p>
      ) : (
        <>
          <ul className="-mx-2 divide-y divide-hairline">
            {shownActions.map((a) => (
              <li key={a.key} className="flex items-start gap-2.5 px-2 py-1.5">
                {a.taskId && (
                  // 44px tap area around the checkbox.
                  <label className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                    <Checkbox
                      aria-label={`Mark "${a.title}" done`}
                      disabled={completeTask.isPending}
                      onCheckedChange={(v) => v && completeTask.mutate(a.taskId!)}
                    />
                  </label>
                )}
                {a.onClick ? (
                  <button type="button" onClick={a.onClick} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-sm font-semibold text-foreground">{a.title}</span>
                    {a.detail && <span className="truncate text-xs text-muted-foreground">{a.detail}</span>}
                  </button>
                ) : (
                  <Link to={a.href} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-sm font-semibold text-foreground">{a.title}</span>
                    {a.detail && <span className="truncate text-xs text-muted-foreground">{a.detail}</span>}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {actions.length > 5 && (
            <button type="button" onClick={() => setAllActions((v) => !v)} className="mt-1 min-h-9 text-sm font-semibold text-primary hover:underline">
              {allActions ? "Show fewer" : `View all ${actions.length}`}
            </button>
          )}
        </>
      )}
    </OverviewCard>
  );

  const moneyCard = (
    <OverviewCard title="Money" links={[{ label: "Money", onClick: () => goTab("money") }]} status={m ? "ready" : "loading"} className="order-3 lg:order-none">
      <FactRow label="Contract value" value={contract > 0 ? money(contract) : "—"} />
      <FactRow label="Paid" value={money(paid)} />
      <FactRow
        label={overpaid > 0.004 ? "Credit (overpaid)" : "Balance remaining"}
        value={overpaid > 0.004 ? <span className="text-success">{money(overpaid)}</span> : money(remaining)}
        strong
      />
      {m && (
        <div className="mt-2 border-t border-hairline pt-2">
          <FactRow label={`${profitWord} profit`} value={money(m.total.profit)} />
          <FactRow label={`${profitWord} margin`} value={pct(m.total.margin)} />
          {!m.final && stage === "during" && (
            <p className="mt-1 text-[11px] text-muted-foreground">Contract minus projected total cost — spend below plan counts at plan until the job's done.</p>
          )}
          {!m.final && stage === "after" && (
            <p className="mt-1 text-[11px] text-muted-foreground">Final once every material line is reconciled (Cost plan › Reconcile materials) — until then delivered materials count at plan.</p>
          )}
        </div>
      )}
    </OverviewCard>
  );

  const featureLinks: CardLink[] = [
    { label: "Cost plan", to: `/projects/${id}/materials` },
    ...(approvedQuote ? [{ label: "Quote", to: `/projects/${id}/quotes/${approvedQuote.id}` }] : []),
    { label: "Change orders", to: `/projects/${id}/change-orders` },
  ];
  const features = (
    <OverviewCard title="Features & profitability" links={featureLinks} status={m ? "ready" : "loading"} skeletonRows={5} className="order-4 lg:order-none">
      {m && <FeaturesTable rows={m.rows} total={m.total} projectId={id} sectionByFeature={sectionByFeature} profitWord={profitWord} />}
      {m && (
        <div className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
          {!m.report.materials.counted && m.report.materials.deliveredTotal > 0 && (
            <p>Delivered materials ({money(m.report.materials.deliveredTotal)}) count in Actual at closeout, once every line is reconciled.</p>
          )}
          {laborPending > 0.004 && <p>Labor includes {money(laborPending)} from timesheets not approved yet.</p>}
        </div>
      )}
    </OverviewCard>
  );

  const materials = (
    <OverviewCard title="Material tracking" links={[{ label: "Materials", onClick: () => goTab("materials") }]} status={mc ? "ready" : "loading"} className="order-5 lg:order-none">
      {stage === "before" || stage === "estimating" ? (
        <p className="text-sm text-muted-foreground">Not started — usage is logged once work begins.</p>
      ) : usageRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No usage logged yet on tracked materials.</p>
      ) : (
        <ul className="space-y-3">
          {usageRows.map((l) => {
            const hasEst = l.needed > 0;
            const over = overEstimate(l.needed, l.used);
            return (
              <li key={l.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-foreground">{l.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {hasEst ? `${qty(l.used)} / ${qty(l.needed)}` : qty(l.used)} {l.unit ?? ""} used
                  </span>
                </div>
                {hasEst && <ThinBar pct={(l.used / l.needed) * 100} className="mt-1.5" />}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {over && `${qty(l.used - l.needed)} ${l.unit ?? ""} over estimate · `}Ordered {qty(l.ordered)} · Delivered {qty(l.delivered)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {nextDelivery && (
        <p className="mt-3 border-t border-hairline pt-3 text-sm text-muted-foreground">
          Next delivery <span className="font-semibold text-foreground">{shortDate(nextDelivery.date)}</span>
          {nextDelivery.order.supplier ? ` · ${nextDelivery.order.supplier}` : ""}
          {nextDelivery.items.length > 0 ? ` · ${nextDelivery.items.slice(0, 3).join(", ")}${nextDelivery.items.length > 3 ? ` +${nextDelivery.items.length - 3}` : ""}` : ""}
        </p>
      )}
    </OverviewCard>
  );

  const clientCard = (
    <OverviewCard
      title="Client"
      links={project.client_id ? [{ label: "Profile", to: `/clients/${project.client_id}` }] : []}
      status={project.client_id ? (clientQ.isLoading ? "loading" : clientQ.isError ? "error" : "ready") : "ready"}
      onRetry={() => clientQ.refetch()}
      className="order-7 lg:order-none"
    >
      {!project.client_id || !client ? (
        <CardEmpty text="No client on this job." />
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-bold text-foreground">{client.name}</p>
          {client.phone && (
            <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground md:min-h-8">
              <Phone className="h-4 w-4 shrink-0" /> {client.phone}
            </a>
          )}
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground md:min-h-8">
              <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{client.email}</span>
            </a>
          )}
          {(project.address || client.address) && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(project.address || client.address || "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground md:min-h-8"
            >
              <Navigation className="h-4 w-4 shrink-0" /> <span className="truncate">Directions</span>
            </a>
          )}
          <div className="border-t border-hairline pt-2">
            {hub === "none" ? (
              client.email ? (
                <button type="button" onClick={onInviteToHub} disabled={invitePending} className="flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline disabled:opacity-50 md:min-h-8">
                  <Send className="h-4 w-4" /> {invitePending ? "Sending…" : "Invite to Client Hub"}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">Add an email to invite them to the Client Hub.</p>
              )
            ) : (
              <Link to={`/projects/${id}/client-view`} className="flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline md:min-h-8">
                <Eye className="h-4 w-4" /> View as client
                <span className="text-xs font-normal text-muted-foreground">· Client Hub {hub === "active" ? "active" : "invited"}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </OverviewCard>
  );

  const updatesCard = (
    <OverviewCard
      title="Recent updates"
      links={[
        { label: "Updates", onClick: () => goTab("updates") },
        { label: "Activity log", onClick: () => goTab("activity") },
      ]}
      status={progressQ.isLoading ? "loading" : progressQ.isError ? "error" : "ready"}
      onRetry={() => progressQ.refetch()}
      className="order-6 lg:order-none"
    >
      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => (
            <li key={u.key} className="flex gap-3">
              {u.photoPaths[0] && urls[u.photoPaths[0]] ? (
                <img src={urls[u.photoPaths[0]]} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-subtle">
                  {u.source} · {timeAgo(u.at)}
                </p>
                <p className="line-clamp-2 text-[13px] text-foreground/85">{u.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );

  // Desktop: two columns (left: health, features, materials; right: next
  // actions, money, client, updates). Phones: one column in the spec's
  // order — the column wrappers are display:contents below lg, so each
  // card's order-* applies.
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start">
      <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-5">
        {health}
        {features}
        {materials}
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        {nextActions}
        {moneyCard}
        {clientCard}
        {updatesCard}
      </div>
    </div>
  );
}

// --- Features table -----------------------------------------------------------

function MarginCell({ row }: { row: FeatureProfitRow }) {
  if (row.margin == null)
    return row.kind === "labor" ? (
      <span className="text-muted-subtle">—</span>
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help text-muted-subtle underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={row.marginWhy}>
            —
          </button>
        </TooltipTrigger>
        <TooltipContent>{row.marginWhy}</TooltipContent>
      </Tooltip>
    );
  const value = <span className="font-semibold">{pct(row.margin)}</span>;
  if (!row.laborAtPlan) return value;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {value}
        </button>
      </TooltipTrigger>
      <TooltipContent>Labor counted at plan — actual labor is logged for the whole job (Labor row).</TooltipContent>
    </Tooltip>
  );
}

function ActualCell({ row }: { row: FeatureProfitRow }) {
  return (
    <span>
      <span className={cn("tabular-nums", row.overPlan > 0.004 ? "font-bold text-foreground" : "text-foreground")}>{money(row.actual)}</span>
      {row.overPlan > 0.004 && <span className="block text-[11px] font-normal text-muted-foreground">+{money(row.overPlan)} over plan</span>}
    </span>
  );
}

function FeaturesTable({
  rows,
  total,
  projectId,
  sectionByFeature,
  profitWord,
}: {
  rows: FeatureProfitRow[];
  total: OverviewMoney["total"];
  projectId: string;
  sectionByFeature: Map<string, string>;
  profitWord: string;
}) {
  const hrefOf = (r: FeatureProfitRow) =>
    r.kind === "feature" && r.featureId && sectionByFeature.get(r.featureId)
      ? `/projects/${projectId}/materials#section-${sectionByFeature.get(r.featureId)}`
      : r.kind === "labor"
        ? `/projects/${projectId}/labor`
        : `/projects/${projectId}/materials`;
  if (rows.length === 0) return <CardEmpty text="No features or Cost plan yet." action={{ label: "Open Cost plan", to: `/projects/${projectId}/materials` }} />;
  return (
    <>
      {/* Desktop: a real table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Price, planned cost, actual to date and {profitWord.toLowerCase()} margin per feature</caption>
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
              <th scope="col" className="py-2 pr-3 text-left font-bold">Feature</th>
              <th scope="col" className="px-3 py-2 text-right font-bold">Price</th>
              <th scope="col" className="px-3 py-2 text-right font-bold">Planned cost</th>
              <th scope="col" className="px-3 py-2 text-right font-bold">Actual to date</th>
              <th scope="col" className="py-2 pl-3 text-right font-bold">{profitWord} margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                  <Link to={hrefOf(r)} className="text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {r.name}
                  </Link>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.price == null ? <span className="text-muted-subtle">—</span> : money(r.price)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.planned)}</td>
                <td className="px-3 py-2.5 text-right"><ActualCell row={r} /></td>
                <td className="py-2.5 pl-3 text-right tabular-nums"><MarginCell row={r} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" className="py-2.5 pr-3 text-left">Total</th>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(total.price)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(total.planned)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(total.actual)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{pct(total.margin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: stacked mini-rows, Total pinned last. */}
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={hrefOf(r)} className="block min-h-11 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">{r.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-foreground">{r.price == null ? "" : money(r.price)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
                <span>Planned {money(r.planned)}</span>
                <span>
                  Actual <span className={r.overPlan > 0.004 ? "font-bold text-foreground" : ""}>{money(r.actual)}</span>
                  {r.overPlan > 0.004 && ` (+${money(r.overPlan)})`}
                </span>
                <span>Margin {r.margin == null ? "—" : pct(r.margin)}</span>
              </div>
            </Link>
          </li>
        ))}
        <li className="py-2.5">
          <div className="flex items-baseline justify-between gap-3 text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums">{money(total.price)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-semibold tabular-nums text-muted-foreground">
            <span>Planned {money(total.planned)}</span>
            <span>Actual {money(total.actual)}</span>
            <span>{profitWord} margin {pct(total.margin)}</span>
          </div>
        </li>
      </ul>
    </>
  );
}

export type { OverviewStage };

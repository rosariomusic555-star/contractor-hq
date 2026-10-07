import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus, Send } from "lucide-react";
import {
  createProjectInvoice,
  listFeatureHistory,
  type ChangeOrder,
  type Invoice,
  type Quote,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/common/StatusPill";
import { FeatureHistoryDialog } from "@/components/materials/FeatureHistoryDialog";
import { useToast } from "@/hooks/use-toast";
import { effectiveInvoiceStatus } from "@/lib/financials";
import { changeOrderNumbers, invoiceKindLabel, invoiceTiming, type Tone } from "@/lib/projectBilling";
import { invoiceBalance, invoicePaid } from "@/lib/projectMoney";
import { featurePrice } from "@/lib/featureFinancials";
import { activeFeatures, featureName, type ProjectFeature } from "@/lib/features";
import type { JobCostReport } from "@/lib/jobCosts";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { cn, formatCurrency } from "@/lib/utils";
import { CardEmpty, OverviewCard } from "./OverviewCard";

const TONE_TEXT: Record<Tone, string> = {
  muted: "text-muted-foreground",
  good: "text-success",
  warn: "text-warning-strong",
  bad: "text-destructive",
};

/**
 * Every invoice on the job — deposit / progress / change order — with its
 * status, amount, paid, balance and due timing (projectBilling helpers, the
 * same as the project Invoices page). Rows open the invoice. "Create
 * invoice" drafts the next one (createProjectInvoice); the deposit step
 * comes from the page's own Won-banner logic.
 */
export function InvoicesCard({
  projectId,
  invoices,
  changeOrders,
  deposit,
}: {
  projectId: string;
  invoices: Invoice[];
  changeOrders: ChangeOrder[];
  /** "Send deposit invoice" when there's one to send / create, else null. */
  deposit: { label: string; href?: string; onClick?: () => void; pending?: boolean } | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = `/projects/${projectId}/invoices`;
  const coNumbers = new Map([...changeOrderNumbers(changeOrders)].map(([id, n]) => [id, `CO-${String(n).padStart(3, "0")}`]));
  const sorted = [...invoices].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const createMut = useMutation({
    mutationFn: () => createProjectInvoice(projectId, "auto"),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      navigate(`${base}/${inv.id}`);
    },
    onError: (err: Error) => toast({ title: "Couldn't create the invoice", description: err.message, variant: "destructive" }),
  });

  return (
    <OverviewCard title="Invoices" headerTo={base} links={[{ label: "Open", to: base }]}>
      {sorted.length === 0 ? (
        <CardEmpty text="No invoices yet." />
      ) : (
        <ul className="-mx-1 divide-y divide-hairline">
          {sorted.map((inv) => {
            const status = effectiveInvoiceStatus(inv);
            const timing = invoiceTiming(inv);
            const balance = invoiceBalance(inv);
            return (
              <li key={inv.id}>
                <Link
                  to={`${base}/${inv.id}`}
                  className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-1 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {inv.invoice_number ?? "Invoice"} · {invoiceKindLabel(inv, coNumbers)}
                      </span>
                      <StatusPill meta={invoiceStatusMeta(status)} />
                    </span>
                    <span className={cn("block text-xs", TONE_TEXT[timing.tone])}>{timing.text}</span>
                  </span>
                  <span className="text-right text-sm font-bold tabular-nums text-foreground">{formatCurrency(Number(inv.amount))}</span>
                  <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">Paid {formatCurrency(invoicePaid(inv))}</span>
                  <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {balance > 0.004 ? `${formatCurrency(balance)} due` : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
        {deposit &&
          (deposit.href ? (
            <Button size="sm" className="h-9 font-bold" asChild>
              <Link to={deposit.href}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> {deposit.label}
              </Link>
            </Button>
          ) : (
            <Button size="sm" className="h-9 font-bold" disabled={deposit.pending} onClick={deposit.onClick}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> {deposit.pending ? "Preparing…" : deposit.label}
            </Button>
          ))}
        <Button size="sm" variant="outline" className="h-9" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {createMut.isPending ? "Creating…" : "Create invoice"}
        </Button>
      </div>
    </OverviewCard>
  );
}

/**
 * Per-feature change history (Original → CO #1 → … → Current) — the Cost
 * plan's FeatureHistoryDialog, one row per feature that has history.
 * Current cost = the feature's planned total (jobCostReport), current
 * price = featurePrice — the same numbers the Cost plan shows.
 */
export function FeatureChangesCard({
  projectId,
  features,
  categories,
  quotes,
  changeOrders,
  report,
}: {
  projectId: string;
  features: ProjectFeature[];
  categories: { id: string; name: string }[];
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  report: JobCostReport | null;
}) {
  const historyQ = useQuery({ queryKey: ["feature-history", projectId], queryFn: () => listFeatureHistory(projectId) });
  const [openId, setOpenId] = useState<string | null>(null);
  const events = historyQ.data ?? [];
  const withHistory = activeFeatures(features).filter((f) => events.some((e) => e.feature_id === f.id));
  const open = openId ? features.find((f) => f.id === openId) : null;
  const plannedOf = (fid: string) => report?.matrix.find((m) => m.featureId === fid)?.total.planned ?? 0;

  return (
    <OverviewCard
      title="Change history"
      status={historyQ.isLoading ? "loading" : historyQ.isError ? "error" : "ready"}
      onRetry={() => historyQ.refetch()}
    >
      {withHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feature has changed since it was sold.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-hairline">
          {withHistory.map((f) => {
            const n = events.filter((e) => e.feature_id === f.id).length;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(f.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-semibold text-foreground">{featureName(f, categories)}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <History className="h-3.5 w-3.5" /> {n} change{n === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <FeatureHistoryDialog
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          featureName={featureName(open, categories)}
          events={events.filter((e) => e.feature_id === open.id)}
          currentCost={plannedOf(open.id)}
          currentPrice={featurePrice(open.id, quotes, changeOrders)}
        />
      )}
    </OverviewCard>
  );
}

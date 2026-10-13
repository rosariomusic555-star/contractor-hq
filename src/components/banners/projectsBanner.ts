import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Hammer, Layers, PiggyBank } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { listInvoices, listPayments, type ChangeOrder, type Invoice, type Payment, type Project } from "@/lib/api";
import { effectiveInvoiceStatus } from "@/lib/financials";
import { projectMoneySummary } from "@/lib/projectMoney";
import { compactMoney, count, inNextDays, parseLocal, pct } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

export type ProjectChip = "overdue_pay" | "co_waiting" | "starting7" | "unpaid_done";
type ProjectFilter = "all" | "in_progress" | "scheduled" | "complete";

type MoneyInvoice = Pick<Invoice, "id" | "amount" | "status" | "amount_paid" | "due_date" | "project_id">;
type MoneyPayment = Pick<Payment, "amount" | "status" | "project_id"> & { payment_allocations?: { invoice_id: string; amount: number }[] };

/** Per project: contract, invoiced, received, still to collect. */
function moneyOf(p: Pick<Project, "id">, contract: number, invoices: MoneyInvoice[], payments: MoneyPayment[]) {
  return projectMoneySummary({
    contractValue: contract,
    invoices: invoices.filter((i) => i.project_id === p.id),
    payments: payments.filter((x) => x.project_id === p.id),
  });
}

export function projectBannerStats(
  projects: Pick<Project, "id" | "status" | "scheduled_start_date">[],
  contractOf: Map<string, number>,
  invoices: MoneyInvoice[],
  payments: MoneyPayment[],
  changeOrders: Pick<ChangeOrder, "project_id" | "status">[],
  now: Date,
) {
  const active = projects.filter((p) => p.status === "scheduled" || p.status === "in_progress");
  const inProgress = projects.filter((p) => p.status === "in_progress");
  const starting14 = projects
    .filter((p) => p.status === "scheduled" && inNextDays(p.scheduled_start_date, 14, now))
    .sort((a, b) => (a.scheduled_start_date ?? "").localeCompare(b.scheduled_start_date ?? ""));
  const money = new Map(projects.map((p) => [p.id, moneyOf(p, contractOf.get(p.id) ?? 0, invoices, payments)]));
  const activeContract = active.reduce((s, p) => s + (contractOf.get(p.id) ?? 0), 0);
  const activeReceived = active.reduce((s, p) => s + Math.min(money.get(p.id)!.received, contractOf.get(p.id) ?? 0), 0);
  const backlog = active.reduce((s, p) => s + Math.max(0, (contractOf.get(p.id) ?? 0) - money.get(p.id)!.invoiced), 0);

  const match = (p: Pick<Project, "id" | "status" | "scheduled_start_date">, chip: ProjectChip) => {
    switch (chip) {
      case "overdue_pay":
        return invoices.some((i) => i.project_id === p.id && effectiveInvoiceStatus(i, now) === "overdue");
      case "co_waiting":
        return changeOrders.some((c) => c.project_id === p.id && c.status === "sent");
      case "starting7":
        return p.status === "scheduled" && inNextDays(p.scheduled_start_date, 7, now);
      case "unpaid_done":
        return p.status === "complete" && (contractOf.get(p.id) ?? 0) > 0 && money.get(p.id)!.remaining > 0.5;
    }
  };
  const chip = (c: ProjectChip) => projects.filter((p) => match(p, c)).length;
  return {
    realJobs: projects.filter((p) => p.status !== "estimating" && p.status !== "lost").length,
    inProgressCount: inProgress.length,
    inProgressValue: inProgress.reduce((s, p) => s + (contractOf.get(p.id) ?? 0), 0),
    starting14,
    backlog,
    activeCount: active.length,
    activeContract,
    collectedShare: activeContract > 0 ? activeReceived / activeContract : null,
    activeReceived,
    match,
    chips: { overdue_pay: chip("overdue_pay"), co_waiting: chip("co_waiting"), starting7: chip("starting7"), unpaid_done: chip("unpaid_done") },
  };
}

const shortDate = (d: string) => parseLocal(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function useProjectsBanner({
  projects,
  contractOf,
  changeOrders,
  loading,
  chip,
  setChip,
  filter,
  setFilter,
}: {
  projects: Project[];
  contractOf: Map<string, number>;
  changeOrders: Pick<ChangeOrder, "project_id" | "status">[];
  loading: boolean;
  chip: ProjectChip | null;
  setChip: (c: ProjectChip | null) => void;
  filter: string;
  setFilter: (f: ProjectFilter) => void;
}): { rich: RichBanner; matches: (p: Project) => boolean } {
  const { data: invoices = [], isLoading: invLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: payments = [], isLoading: payLoading } = useQuery({ queryKey: ["payments"], queryFn: () => listPayments() });
  const now = new Date();
  const st = projectBannerStats(projects, contractOf, invoices, payments, changeOrders, now);

  let insight: string;
  if (st.realJobs === 0 && projects.length === 0) insight = "No projects yet — create your first one";
  else if (st.activeCount === 0) insight = st.realJobs ? "Nothing scheduled or in progress right now" : "No jobs under contract yet";
  else
    insight = [
      st.inProgressCount ? `${st.inProgressCount} in progress` : null,
      st.chips.starting7 ? `${st.chips.starting7} starting this week` : null,
      st.backlog > 0 ? `${compactMoney(st.backlog)} booked ahead` : null,
    ]
      .filter(Boolean)
      .join(" · ") || `${count(st.activeCount, "job")} scheduled`;

  const go = (f: ProjectFilter) => {
    setChip(null);
    setFilter(f);
  };
  const next = st.starting14[0];
  const rich: RichBanner = {
    insight,
    loading: loading || invLoading || payLoading,
    listId: "projects-list",
    activeChip: chip,
    onChip: (k) => {
      setChip(k as ProjectChip | null);
      if (k) setFilter("all");
    },
    chips: [
      { key: "overdue_pay", label: st.chips.overdue_pay === 1 ? "payment overdue" : "with payments overdue", count: st.chips.overdue_pay },
      { key: "co_waiting", label: st.chips.co_waiting === 1 ? "change order waiting on client" : "change orders waiting on client", count: st.chips.co_waiting },
      { key: "starting7", label: "starting in 7 days", count: st.chips.starting7 },
      { key: "unpaid_done", label: "finished, not fully paid", count: st.chips.unpaid_done },
    ],
    tiles: [
      {
        key: "progress",
        label: "In progress",
        icon: Hammer,
        value: st.inProgressCount ? String(st.inProgressCount) : "—",
        sub: st.inProgressCount ? `${formatCurrency(st.inProgressValue)} in contracts` : st.realJobs ? "Nothing in progress" : "Jobs you're building show here",
        onClick: () => go("in_progress"),
        active: !chip && filter === "in_progress",
      },
      {
        key: "starting",
        label: "Starting next 14 days",
        icon: CalendarClock,
        value: st.starting14.length ? String(st.starting14.length) : "—",
        sub: next?.scheduled_start_date ? `Next: ${shortDate(next.scheduled_start_date)}` : "Nothing starting soon",
        onClick: () => go("scheduled"),
        active: !chip && filter === "scheduled",
      },
      {
        key: "backlog",
        label: "Backlog",
        icon: Layers,
        value: st.activeCount ? formatCurrency(st.backlog) : "—",
        sub: st.activeCount ? "contracted, not yet invoiced" : "Signed work not yet billed",
        onClick: () => go("all"),
      },
      {
        key: "collected",
        label: "Collected vs contract",
        icon: PiggyBank,
        value: st.collectedShare == null ? "—" : pct(st.collectedShare),
        sub: st.collectedShare == null ? "Across active jobs" : `${compactMoney(st.activeReceived)} of ${compactMoney(st.activeContract)}, active jobs`,
        visual: st.collectedShare == null ? undefined : { kind: "progress", value: st.collectedShare },
        onClick: () => go("all"),
      },
    ],
  };
  return { rich, matches: (p) => !chip || st.match(p, chip) };
}

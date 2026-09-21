import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { cn, formatCurrency } from "@/lib/utils";
import {
  listInvoices,
  listQuotes,
  listCategories,
  listProjects,
  listChangeOrders,
  listMaterialsSheets,
  listAllMaterialsSections,
  listClients,
  type ChangeOrder,
  type Quote,
} from "@/lib/api";
import {
  resolveRange,
  invoicedTotal,
  collectedTotal,
  buildProjectFinancials,
  marginRowsInRange,
  avgMargin,
  closedJobRows,
  jobStats,
  monthlyBreakdown,
  revenueByCategoryInvoiced,
  revenueByClient,
} from "@/lib/revenue";
import { agingBuckets } from "@/lib/aging";

const GREY = "hsl(201 12% 46%)";
const GREEN = "hsl(131 36% 64%)";
const CATEGORY_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--sidebar-background))",
  "hsl(var(--info))",
  "hsl(var(--warning-strong))",
  "hsl(var(--border))",
];

/** Same "wraps a stat card so it's a real link" pattern as the Dashboard's
 * clickable KPI tiles — chevron + hover lift, and a real <Link> so
 * cmd/ctrl-click opens a new tab. */
const CARD_LINK_CLASS =
  "group block rounded-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function RevenueView() {
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: materialsSheets = [] } = useQuery({ queryKey: ["materials-sheets"], queryFn: () => listMaterialsSheets() });
  const { data: materialsSections = [] } = useQuery({
    queryKey: ["materials-sections-all"],
    queryFn: listAllMaterialsSections,
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const thisMonthRange = useMemo(() => resolveRange("this_month", undefined), []);
  const last12Range = useMemo(() => resolveRange("last_12", undefined), []);

  const quotesByProject = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes) {
      if (!q.project_id) continue;
      const list = map.get(q.project_id);
      if (list) list.push(q);
      else map.set(q.project_id, [q]);
    }
    return map;
  }, [quotes]);

  const changeOrdersByProject = useMemo(() => {
    const map = new Map<string, ChangeOrder[]>();
    for (const co of changeOrders) {
      const list = map.get(co.project_id);
      if (list) list.push(co);
      else map.set(co.project_id, [co]);
    }
    return map;
  }, [changeOrders]);

  const projectFinancials = useMemo(
    () =>
      buildProjectFinancials(
        projects,
        quotesByProject,
        changeOrdersByProject,
        materialsSheets,
        materialsSections,
        categories,
      ),
    [projects, quotesByProject, changeOrdersByProject, materialsSheets, materialsSections, categories],
  );

  // ---- 1. This month / Invoiced ----
  const thisMonthInvoiced = invoicedTotal(invoices, thisMonthRange);

  // ---- 2. Collected ----
  const thisMonthCollected = collectedTotal(invoices, thisMonthRange);
  const outstandingNow = agingBuckets(invoices).reduce((s, b) => s + b.amount, 0);

  // ---- 3. Avg. margin ----
  const marginResult = avgMargin(marginRowsInRange(projectFinancials, last12Range));

  // ---- 4. Avg. job ----
  const jobResult = jobStats(closedJobRows(projectFinancials, last12Range));

  // ---- 5. Invoiced by month ----
  const monthlyData = useMemo(() => monthlyBreakdown(invoices, last12Range), [invoices, last12Range]);

  // ---- 6. Revenue by category ----
  const byCategory = useMemo(() => {
    const rows = revenueByCategoryInvoiced(invoices, quotes, categories, projectFinancials, last12Range).filter(
      (r) => r.revenue > 0,
    );
    const sum = rows.reduce((s, r) => s + r.revenue, 0) || 1;
    return rows.slice(0, 6).map((r, i) => ({
      ...r,
      pct: Math.round((r.revenue / sum) * 100),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [invoices, quotes, categories, projectFinancials, last12Range]);

  // ---- 7. Revenue by client ----
  const byClient = useMemo(
    () => revenueByClient(invoices, projects, clients, last12Range).filter((r) => r.revenue > 0).slice(0, 6),
    [invoices, projects, clients, last12Range],
  );

  const totalBilled = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title="Revenue"
        subtitle={`${formatCurrency(totalBilled)} invoiced · ${formatCurrency(outstandingNow)} outstanding`}
        back={{ to: "/dashboard", label: "Home" }}
      />
      <PageHeader
        title="Revenue"
        subtitle={`${formatCurrency(totalBilled)} invoiced · ${formatCurrency(totalPaid)} collected · ${formatCurrency(outstandingNow)} outstanding`}
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Link to="/revenue/invoiced" className={CARD_LINK_CLASS}>
          <KpiCard label="This month" value={formatCurrency(thisMonthInvoiced)} sub="invoiced" clickable />
        </Link>
        <Link to="/revenue/collected" className={CARD_LINK_CLASS}>
          <KpiCard
            label="Collected"
            value={formatCurrency(thisMonthCollected)}
            sub={`${formatCurrency(outstandingNow)} outstanding`}
            clickable
          />
        </Link>
        <Link to="/revenue/margin" className={CARD_LINK_CLASS}>
          <KpiCard
            label="Avg. margin"
            value={marginResult.avgPct != null ? `${marginResult.avgPct}%` : "—"}
            sub="last 12 months"
            clickable
          />
        </Link>
        <Link to="/revenue/jobs" className={CARD_LINK_CLASS}>
          <KpiCard
            label="Avg. job"
            value={formatCurrency(jobResult.avg)}
            sub={`${jobResult.count} closed`}
            clickable
          />
        </Link>
      </div>

      <Link to="/revenue/monthly" className={cn(CARD_LINK_CLASS, "block")}>
        <section className="card-surface p-5 transition-shadow md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Invoiced by month</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-[11px] font-semibold text-muted-subtle">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Paid</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREY }} />Billed</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
                <XAxis dataKey="shortLabel" axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  cursor={{ fill: "hsl(214 22% 94%)" }}
                  contentStyle={{ background: "#fff", border: "1px solid hsl(212 21% 91%)", borderRadius: 12, fontSize: 13 }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="invoiced" name="Billed" fill={GREY} radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Paid" fill={GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </Link>

      <div className="grid gap-5 lg:grid-cols-2">
        <Link to="/revenue/categories" className={CARD_LINK_CLASS}>
          <section className="card-surface p-5 transition-shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Revenue by category</h3>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
            </div>
            {byCategory.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No invoiced revenue in the last 12 months yet.
              </p>
            ) : (
              <div className="mt-2">
                {byCategory.map((c) => (
                  <div key={c.id} className="border-b border-hairline py-3 last:border-0">
                    <div className="flex justify-between text-[13px]">
                      <span className="font-semibold text-foreground">{c.name}</span>
                      <span className="font-bold tabular-nums text-foreground">{formatCurrency(c.revenue)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                      </div>
                      <span className="w-8 text-right text-[11px] font-bold text-muted-subtle">{c.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Link>

        <Link to="/revenue/clients" className={CARD_LINK_CLASS}>
          <section className="card-surface p-5 transition-shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Revenue by client</h3>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
            </div>
            {byClient.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No invoiced revenue in the last 12 months yet.</p>
            ) : (
              <div className="mt-2">
                {byClient.map((c) => (
                  <div key={c.client.id} className="border-b border-hairline py-3 last:border-0">
                    <div className="flex justify-between text-[13px]">
                      <span className="truncate font-semibold text-foreground">{c.client.name}</span>
                      <span className="font-bold tabular-nums text-foreground">{formatCurrency(c.revenue)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-[11px] font-bold text-muted-subtle">{c.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Link>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { SortableTh } from "@/components/common/SortableTh";
import { KpiCard } from "@/components/common/KpiCard";
import { formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listChangeOrders,
  listInvoices,
  listMaterialsSheets,
  listAllMaterialsSections,
  listExpenses,
  listCategories,
  type ChangeOrder,
  type Invoice,
  type Quote,
} from "@/lib/api";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { useSort } from "@/hooks/use-sort";
import {
  buildProjectFinancials,
  closedJobRows,
  jobStats,
  jobSizeDistribution,
  rangeDateLabel,
  type ProjectFinancials,
} from "@/lib/financials";

export function RevenueJobsView() {
  const navigate = useNavigate();
  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange("last_12");

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: materialsSheets = [] } = useQuery({ queryKey: ["materials-sheets"], queryFn: () => listMaterialsSheets() });
  const { data: materialsSections = [] } = useQuery({
    queryKey: ["materials-sections-all"],
    queryFn: listAllMaterialsSections,
  });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => listExpenses() });

  const invoicesByProject = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      if (!inv.project_id) continue;
      const list = map.get(inv.project_id);
      if (list) list.push(inv);
      else map.set(inv.project_id, [inv]);
    }
    return map;
  }, [invoices]);

  const expensesByProject = useMemo(() => {
    const map = new Map<string, { amount: number }[]>();
    for (const e of expenses) {
      const list = map.get(e.project_id);
      if (list) list.push(e);
      else map.set(e.project_id, [e]);
    }
    return map;
  }, [expenses]);

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

  const financials = useMemo(
    () =>
      buildProjectFinancials(
        projects,
        quotesByProject,
        changeOrdersByProject,
        invoicesByProject,
        materialsSheets,
        materialsSections,
        expensesByProject,
        categories,
      ),
    [projects, quotesByProject, changeOrdersByProject, invoicesByProject, materialsSheets, materialsSections, expensesByProject, categories],
  );

  const rows = useMemo(() => closedJobRows(financials, range), [financials, range]);
  const stats = jobStats(rows);
  const distribution = useMemo(() => jobSizeDistribution(rows), [rows]);

  const byCategory = useMemo(() => {
    const totals = new Map<string, { name: string; sum: number; count: number }>();
    for (const r of rows) {
      const key = r.category?.id ?? "uncategorized";
      const name = r.category?.name ?? "Uncategorized";
      const t = totals.get(key) ?? { name, sum: 0, count: 0 };
      t.sum += r.contractValue;
      t.count += 1;
      totals.set(key, t);
    }
    return [...totals.values()].map((t) => ({ ...t, avg: Math.round(t.sum / t.count) })).sort((a, b) => b.avg - a.avg);
  }, [rows]);

  const { sorted, sortKey, dir, toggle } = useSort<ProjectFinancials>(
    rows,
    {
      project: (r) => r.project.name,
      client: (r) => r.project.client?.name ?? "",
      category: (r) => r.category?.name ?? "Uncategorized",
      value: (r) => r.contractValue,
      completed: (r) => r.jobDate,
    },
    "completed",
  );

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Avg. job"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Average" value={formatCurrency(stats.avg)} sub={rangeDateLabel(range)} />
        <KpiCard label="Median" value={formatCurrency(stats.median)} sub={`${stats.count} closed`} />
        <KpiCard label="Largest" value={formatCurrency(stats.max)} />
        <KpiCard label="Smallest" value={formatCurrency(stats.min)} />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && (
        <>
          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh label="Project" active={sortKey === "project"} dir={dir} onClick={() => toggle("project", true)} />
                    <SortableTh label="Client" active={sortKey === "client"} dir={dir} onClick={() => toggle("client", true)} />
                    <SortableTh label="Category" active={sortKey === "category"} dir={dir} onClick={() => toggle("category", true)} />
                    <SortableTh label="Value" active={sortKey === "value"} dir={dir} onClick={() => toggle("value")} />
                    <SortableTh label="Completed" active={sortKey === "completed"} dir={dir} onClick={() => toggle("completed")} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.project.id} className="cursor-pointer" onClick={() => navigate(`/projects/${r.project.id}`)}>
                      <td className="font-bold text-foreground">{r.project.name}</td>
                      <td className="text-muted-foreground">{r.project.client?.name ?? "—"}</td>
                      <td className="text-muted-foreground">{r.category?.name ?? "Uncategorized"}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(r.contractValue)}</td>
                      <td className="text-muted-foreground">{r.jobDate.slice(0, 10)}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">No closed jobs in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Size distribution</h3>
              <div className="mt-2">
                {distribution.map((b) => {
                  const maxCount = Math.max(1, ...distribution.map((x) => x.count));
                  return (
                    <div key={b.key} className="border-b border-hairline py-3 last:border-0">
                      <div className="flex justify-between text-[13px]">
                        <span className="font-semibold text-foreground">{b.label}</span>
                        <span className="font-bold tabular-nums text-foreground">{pluralize(b.count, "job")}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Average by category</h3>
              {byCategory.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No closed jobs in this range.</p>
              ) : (
                <div className="mt-2">
                  {byCategory.map((c) => (
                    <div key={c.name} className="flex items-center justify-between border-b border-hairline py-2.5 last:border-0">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{c.name}</p>
                        <p className="text-[11px] text-muted-subtle">{pluralize(c.count, "job")}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(c.avg)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

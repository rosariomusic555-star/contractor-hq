import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { SortableTh } from "@/components/common/SortableTh";
import { KpiCard } from "@/components/common/KpiCard";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { StatusPill } from "@/components/common/StatusPill";
import { projectStatusMeta } from "@/lib/statusMeta";
import {
  listInvoices,
  listQuotes,
  listCategories,
  listProjects,
  listChangeOrders,
  listMaterialsSheets,
  listAllMaterialsSections,
  type ChangeOrder,
  type Quote,
} from "@/lib/api";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { useSort } from "@/hooks/use-sort";
import {
  buildProjectFinancials,
  marginRowsInRange,
  revenueByCategoryInvoiced,
  invoicedTotal,
  rangeDateLabel,
  type CategoryRow,
} from "@/lib/revenue";

export function RevenueCategoriesView() {
  const navigate = useNavigate();
  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange("last_12");
  const [selected, setSelected] = useState<string | null>(null);

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
    () => buildProjectFinancials(projects, quotesByProject, changeOrdersByProject, materialsSheets, materialsSections, categories),
    [projects, quotesByProject, changeOrdersByProject, materialsSheets, materialsSections, categories],
  );

  const rows = useMemo(
    () => revenueByCategoryInvoiced(invoices, quotes, categories, financials, range),
    [invoices, quotes, categories, financials, range],
  );
  const total = invoicedTotal(invoices, range);

  const { sorted, sortKey, dir, toggle } = useSort<CategoryRow>(
    rows,
    {
      category: (r) => r.name,
      revenue: (r) => r.revenue,
      jobs: (r) => r.jobCount,
      avg: (r) => r.avgJobValue,
      margin: (r) => r.marginPct ?? -Infinity,
    },
    "revenue",
  );

  const selectedJobs = useMemo(() => {
    if (!selected) return [];
    return marginRowsInRange(financials, range).filter((r) => (r.category?.id ?? "uncategorized") === selected);
  }, [selected, financials, range]);

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Revenue by category"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:max-w-md">
        <KpiCard label="Invoiced" value={formatCurrency(total)} sub={rangeDateLabel(range)} />
        <KpiCard label="Categories" value={rows.length} sub="incl. Uncategorized" />
      </div>
      <p className="text-xs text-muted-foreground">
        Revenue here means invoiced amounts (same basis as the rest of this page), split across categories by
        each invoice's linked quote — not only fully-paid quotes.
      </p>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Category" active={sortKey === "category"} dir={dir} onClick={() => toggle("category", true)} />
                  <SortableTh label="Revenue" active={sortKey === "revenue"} dir={dir} onClick={() => toggle("revenue")} />
                  <SortableTh label="Jobs" active={sortKey === "jobs"} dir={dir} onClick={() => toggle("jobs")} />
                  <SortableTh label="Avg. job value" active={sortKey === "avg"} dir={dir} onClick={() => toggle("avg")} />
                  <SortableTh label="Margin %" active={sortKey === "margin"} dir={dir} onClick={() => toggle("margin")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className={cn("cursor-pointer", selected === r.id && "bg-muted/50")}
                    onClick={() => setSelected(selected === r.id ? null : r.id)}
                  >
                    <td className="font-bold text-foreground">{r.name}</td>
                    <td className="font-bold tabular-nums">{formatCurrency(r.revenue)}</td>
                    <td className="text-muted-foreground">{r.jobCount}</td>
                    <td className="tabular-nums text-muted-foreground">{formatCurrency(r.avgJobValue)}</td>
                    <td className="tabular-nums text-muted-foreground">{r.marginPct != null ? `${r.marginPct}%` : "—"}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">No invoiced revenue in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <section className="card-surface overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="text-base font-bold text-foreground">
              {categories.find((c) => c.id === selected)?.name ?? "Uncategorized"} jobs
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">{pluralize(selectedJobs.length, "job")}</span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedJobs.map((r) => (
                  <tr key={r.project.id} className="cursor-pointer" onClick={() => navigate(`/projects/${r.project.id}`)}>
                    <td className="font-bold text-foreground">{r.project.name}</td>
                    <td className="text-muted-foreground">{r.project.client?.name ?? "—"}</td>
                    <td className="font-bold tabular-nums">{formatCurrency(r.revenue)}</td>
                    <td><StatusPill meta={projectStatusMeta(r.project.status)} /></td>
                  </tr>
                ))}
                {selectedJobs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">No jobs here.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

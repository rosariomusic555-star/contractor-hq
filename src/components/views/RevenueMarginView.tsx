import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { SortableTh } from "@/components/common/SortableTh";
import { KpiCard } from "@/components/common/KpiCard";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listChangeOrders,
  listMaterialsSheets,
  listAllMaterialsSections,
  listCategories,
  type ChangeOrder,
  type Quote,
} from "@/lib/api";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { useSort } from "@/hooks/use-sort";
import {
  buildProjectFinancials,
  marginRowsInRange,
  avgMargin,
  rangeDateLabel,
  type ProjectFinancials,
} from "@/lib/revenue";

export function RevenueMarginView() {
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

  const rows = useMemo(() => marginRowsInRange(financials, range), [financials, range]);
  const { avgPct, includedCount, excludedCount } = avgMargin(rows);

  const { sorted, sortKey, dir, toggle } = useSort<ProjectFinancials>(
    rows,
    {
      project: (r) => r.project.name,
      client: (r) => r.project.client?.name ?? "",
      revenue: (r) => r.revenue,
      cost: (r) => r.cost ?? -1,
      profit: (r) => r.profit ?? -Infinity,
      margin: (r) => r.marginPct ?? -Infinity,
    },
    "margin",
  );

  const byCategory = useMemo(() => {
    const withCost = rows.filter((r) => r.profit != null);
    const totals = new Map<string, { name: string; profit: number; revenue: number; count: number }>();
    for (const r of withCost) {
      const key = r.category?.id ?? "uncategorized";
      const name = r.category?.name ?? "Uncategorized";
      const t = totals.get(key) ?? { name, profit: 0, revenue: 0, count: 0 };
      t.profit += r.profit!;
      t.revenue += r.revenue;
      t.count += 1;
      totals.set(key, t);
    }
    return [...totals.values()]
      .map((t) => ({ ...t, marginPct: t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const byMonth = useMemo(() => {
    const withCost = rows.filter((r) => r.profit != null);
    const totals = new Map<string, { label: string; profit: number; revenue: number; count: number }>();
    for (const r of withCost) {
      const key = r.jobDate.slice(0, 7);
      const label = new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const t = totals.get(key) ?? { label, profit: 0, revenue: 0, count: 0 };
      t.profit += r.profit!;
      t.revenue += r.revenue;
      t.count += 1;
      totals.set(key, t);
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, t]) => ({ ...t, marginPct: t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : 0 }));
  }, [rows]);

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Avg. margin"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <KpiCard label="Avg. margin" value={avgPct != null ? `${avgPct}%` : "—"} sub={rangeDateLabel(range)} />
        <KpiCard label="Jobs included" value={includedCount} sub="have a linked materials sheet" />
        <KpiCard
          label="Jobs excluded"
          value={excludedCount}
          sub="cost unknown — no materials sheet"
          subTone={excludedCount > 0 ? "negative" : "muted"}
        />
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
                    <SortableTh label="Revenue" active={sortKey === "revenue"} dir={dir} onClick={() => toggle("revenue")} />
                    <SortableTh label="Est. cost" active={sortKey === "cost"} dir={dir} onClick={() => toggle("cost")} />
                    <SortableTh label="Profit" active={sortKey === "profit"} dir={dir} onClick={() => toggle("profit")} />
                    <SortableTh label="Margin %" active={sortKey === "margin"} dir={dir} onClick={() => toggle("margin")} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.project.id} className="cursor-pointer" onClick={() => navigate(`/projects/${r.project.id}`)}>
                      <td className="font-bold text-foreground">{r.project.name}</td>
                      <td className="text-muted-foreground">{r.project.client?.name ?? "—"}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(r.revenue)}</td>
                      <td className={cn("tabular-nums", r.cost == null && "text-muted-subtle")}>
                        {r.cost != null ? formatCurrency(r.cost) : "Cost unknown"}
                      </td>
                      <td className={cn("font-bold tabular-nums", r.profit == null && "text-muted-subtle")}>
                        {r.profit != null ? formatCurrency(r.profit) : "—"}
                      </td>
                      <td className={cn("font-bold tabular-nums", r.marginPct == null && "text-muted-subtle")}>
                        {r.marginPct != null ? `${r.marginPct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">No priced jobs in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Margin by category</h3>
              {byCategory.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No costed jobs in this range.</p>
              ) : (
                <div className="mt-2">
                  {byCategory.map((c) => (
                    <div key={c.name} className="flex items-center justify-between border-b border-hairline py-2.5 last:border-0">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{c.name}</p>
                        <p className="text-[11px] text-muted-subtle">{pluralize(c.count, "job")}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-foreground">{c.marginPct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Margin by month</h3>
              {byMonth.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No costed jobs in this range.</p>
              ) : (
                <div className="mt-2">
                  {byMonth.map((m) => (
                    <div key={m.label} className="flex items-center justify-between border-b border-hairline py-2.5 last:border-0">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{m.label}</p>
                        <p className="text-[11px] text-muted-subtle">{pluralize(m.count, "job")}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-foreground">{m.marginPct}%</span>
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

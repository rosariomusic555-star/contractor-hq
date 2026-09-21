import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { SortableTh } from "@/components/common/SortableTh";
import { SearchInput } from "@/components/common/SearchInput";
import { KpiCard } from "@/components/common/KpiCard";
import { formatCurrency } from "@/lib/utils";
import { listInvoices, listProjects, listClients } from "@/lib/api";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { useSort } from "@/hooks/use-sort";
import { revenueByClient, invoicedTotal, rangeDateLabel, type ClientRevenueRow } from "@/lib/revenue";

export function RevenueClientsView() {
  const navigate = useNavigate();
  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange("last_12");
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const rows = useMemo(() => revenueByClient(invoices, projects, clients, range), [invoices, projects, clients, range]);
  const total = invoicedTotal(invoices, range);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.client.name.toLowerCase().includes(term));
  }, [rows, search]);

  const { sorted, sortKey, dir, toggle } = useSort<ClientRevenueRow>(
    filtered,
    {
      client: (r) => r.client.name,
      revenue: (r) => r.revenue,
      share: (r) => r.pct,
      jobs: (r) => r.jobCount,
      outstanding: (r) => r.outstanding,
      lastJob: (r) => r.lastJobDate ?? "",
    },
    "revenue",
  );

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Revenue by client"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:max-w-md">
        <KpiCard label="Invoiced" value={formatCurrency(total)} sub={rangeDateLabel(range)} />
        <KpiCard label="Clients" value={rows.filter((r) => r.revenue > 0).length} sub={`of ${rows.length} total`} />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search clients" className="md:max-w-xs" />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Client" active={sortKey === "client"} dir={dir} onClick={() => toggle("client", true)} />
                  <SortableTh label="Revenue" active={sortKey === "revenue"} dir={dir} onClick={() => toggle("revenue")} />
                  <SortableTh label="Share" active={sortKey === "share"} dir={dir} onClick={() => toggle("share")} />
                  <SortableTh label="Jobs" active={sortKey === "jobs"} dir={dir} onClick={() => toggle("jobs")} />
                  <SortableTh label="Outstanding" active={sortKey === "outstanding"} dir={dir} onClick={() => toggle("outstanding")} />
                  <SortableTh label="Last job" active={sortKey === "lastJob"} dir={dir} onClick={() => toggle("lastJob")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.client.id} className="cursor-pointer" onClick={() => navigate(`/clients/${r.client.id}`)}>
                    <td className="font-bold text-foreground">{r.client.name}</td>
                    <td className="font-bold tabular-nums">{formatCurrency(r.revenue)}</td>
                    <td className="tabular-nums text-muted-foreground">{r.pct}%</td>
                    <td className="text-muted-foreground">{r.jobCount}</td>
                    <td className={r.outstanding > 0 ? "tabular-nums text-destructive" : "tabular-nums text-muted-foreground"}>
                      {formatCurrency(r.outstanding)}
                    </td>
                    <td className="text-muted-foreground">{r.lastJobDate?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">No clients found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

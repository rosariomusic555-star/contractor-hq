import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { SortableTh } from "@/components/common/SortableTh";
import { KpiCard } from "@/components/common/KpiCard";
import { StatusPill } from "@/components/common/StatusPill";
import { formatCurrency, pluralize } from "@/lib/utils";
import { listInvoices, type Invoice, type InvoiceStatus } from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { useSort } from "@/hooks/use-sort";
import { invoiceDaysLate, invoicedTotal, rangeDateLabel, withinRange } from "@/lib/financials";

const clientOf = (inv: Invoice) => inv.project?.client?.name ?? "No client";

export function RevenueInvoicedView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const month = searchParams.get("month"); // "2026-09" — drill-down from the monthly page

  const initialCustom = month
    ? { start: `${month}-01`, end: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10) }
    : undefined;

  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange(
    "this_month",
    initialCustom,
  );
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [client, setClient] = useState("all");
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  // Draft invoices never count toward the "Invoiced" total (they haven't
  // been sent to anyone), but the browsable list below still needs to show
  // them — the status filter has a "Draft" option so a contractor can find
  // and send one. So the list stays all-status-in-range; only the headline
  // total and count use the real (draft-excluded) figure.
  const inRange = useMemo(() => invoices.filter((i) => withinRange(i.created_at, range)), [invoices, range]);
  const total = invoicedTotal(invoices, range);
  const realCount = inRange.filter((i) => i.status !== "draft").length;

  const clientOptions = useMemo(
    () => [...new Set(inRange.map(clientOf))].sort((a, b) => a.localeCompare(b)),
    [inRange],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inRange.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (client !== "all" && clientOf(inv) !== client) return false;
      if (!term) return true;
      return (
        (inv.invoice_number ?? "").toLowerCase().includes(term) ||
        (inv.project?.name ?? "").toLowerCase().includes(term) ||
        clientOf(inv).toLowerCase().includes(term)
      );
    });
  }, [inRange, status, client, search]);

  const { sorted, sortKey, dir, toggle } = useSort<Invoice>(
    filtered,
    {
      invoice: (i) => i.invoice_number ?? "",
      client: clientOf,
      project: (i) => i.project?.name ?? "",
      date: (i) => i.created_at,
      amount: (i) => Number(i.amount),
      status: (i) => i.status,
    },
    "date",
  );

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Invoiced"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:max-w-md">
        <KpiCard label="Invoiced" value={formatCurrency(total)} sub={rangeDateLabel(range)} />
        <KpiCard label="Invoices" value={realCount} sub={pluralize(realCount, "invoice")} />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | InvoiceStatus)}>
            <SelectTrigger className="h-9 w-[140px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Shared</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="h-9 w-[160px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoices or jobs" className="md:max-w-xs" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && (
        <div className="card-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Invoice" active={sortKey === "invoice"} dir={dir} onClick={() => toggle("invoice", true)} />
                  <SortableTh label="Client" active={sortKey === "client"} dir={dir} onClick={() => toggle("client", true)} />
                  <SortableTh label="Project" active={sortKey === "project"} dir={dir} onClick={() => toggle("project", true)} />
                  <SortableTh label="Date issued" active={sortKey === "date"} dir={dir} onClick={() => toggle("date")} />
                  <SortableTh label="Amount" active={sortKey === "amount"} dir={dir} onClick={() => toggle("amount")} />
                  <SortableTh label="Status" active={sortKey === "status"} dir={dir} onClick={() => toggle("status", true)} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) => {
                  const late = invoiceDaysLate(inv);
                  return (
                    <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="font-bold text-foreground">{inv.invoice_number ?? "—"}</td>
                      <td>{clientOf(inv)}</td>
                      <td className="text-muted-foreground">{inv.project?.name ?? "Standalone"}</td>
                      <td className="text-muted-foreground">{inv.created_at.slice(0, 10)}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(Number(inv.amount))}</td>
                      <td>
                        {late > 0 ? (
                          <span className="badge-status badge-overdue">{late} days late</span>
                        ) : (
                          <StatusPill meta={invoiceStatusMeta(inv.status)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">No invoices in this range.</td>
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { SearchInput } from "@/components/common/SearchInput";
import { FilterSegment, FilterPills, type FilterOption } from "@/components/common/FilterControls";
import { ListCard } from "@/components/common/ListCard";
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { listInvoices, createInvoice, deleteInvoice, type Invoice, type InvoiceStatus } from "@/lib/api";
import { invoiceStatusMeta } from "@/lib/statusMeta";
import { agingBuckets, invoiceDaysLate, overdueCount } from "@/lib/aging";

/** "unpaid" is a combined filter — sent + overdue, i.e. billed but not yet
 * paid. Same definition the Dashboard's own "Unpaid" KPI uses, so arriving
 * from that card shows the same total. */
type Filter = "all" | InvoiceStatus | "unpaid";
const VALID_FILTERS: Filter[] = ["all", "unpaid", "draft", "sent", "overdue", "paid"];

const DAY = 86_400_000;

export function InvoicesView() {
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(
    VALID_FILTERS.includes(initialFilter as Filter) ? (initialFilter as Filter) : "all",
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const now = new Date();

  const { data: invoices = [], isLoading, isError, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete invoice", description: err.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: () => createInvoice(),
    onSuccess: (invoice) => navigate(`/invoices/${invoice.id}`),
    onError: (err: Error) =>
      toast({ title: "Couldn't create invoice", description: err.message, variant: "destructive" }),
  });

  const buckets = agingBuckets(invoices, now);
  const outstandingTotal = buckets.reduce((s, b) => s + b.amount, 0);
  const over30 = overdueCount(invoices, 30, now);
  const paidLast30 = invoices
    .filter((i) => i.status === "paid" && i.paid_at && now.getTime() - new Date(i.paid_at).getTime() <= 30 * DAY)
    .reduce((s, i) => s + Number(i.amount), 0);
  const paidLast30Count = invoices.filter(
    (i) => i.status === "paid" && i.paid_at && now.getTime() - new Date(i.paid_at).getTime() <= 30 * DAY,
  ).length;

  const countByStatus = (s: InvoiceStatus) => invoices.filter((i) => i.status === s).length;

  const unpaidCount = countByStatus("sent") + countByStatus("overdue");

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: invoices.length },
    { value: "unpaid", label: "Unpaid", count: unpaidCount },
    { value: "draft", label: "Draft", count: countByStatus("draft") },
    { value: "sent", label: "Shared", count: countByStatus("sent") },
    { value: "overdue", label: "Overdue", count: countByStatus("overdue") },
    { value: "paid", label: "Paid", count: countByStatus("paid") },
  ];

  const lateLabel = (inv: Invoice) => {
    const d = invoiceDaysLate(inv, now);
    return d > 0 ? `${d} days late` : null;
  };

  const filtered = invoices.filter((inv) => {
    if (
      filter === "unpaid"
        ? inv.status !== "sent" && inv.status !== "overdue"
        : filter !== "all" && inv.status !== filter
    )
      return false;
    const term = search.toLowerCase();
    return (
      !term ||
      (inv.invoice_number ?? "").toLowerCase().includes(term) ||
      (inv.project?.name ?? "").toLowerCase().includes(term) ||
      (inv.project?.client?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader
        title="Invoices"
        subtitle={`Outstanding ${formatCurrency(outstandingTotal)}${over30 ? ` · ${over30} over 30 days` : ""}`}
        actions={
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="h-8 rounded-[0.625rem] bg-sidebar-primary px-3 text-[13px] font-bold text-sidebar-primary-foreground disabled:opacity-60"
          >
            + New
          </button>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search invoices or jobs"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Invoices"
        subtitle={
          <>
            Outstanding <span className="font-bold text-foreground">{formatCurrency(outstandingTotal)}</span>
            {over30 ? ` · ${over30} over 30 days` : ""}
          </>
        }
        actions={
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="font-bold">
            + New invoice
          </Button>
        }
      />

      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current" value={formatCurrency(buckets[0].amount)} sub={`${buckets[0].count} due soon`} />
        <KpiCard label="1–30 days" value={formatCurrency(buckets[1].amount)} sub={`${buckets[1].count} invoice${buckets[1].count === 1 ? "" : "s"}`} />
        <KpiCard label="31–60 days" value={formatCurrency(buckets[2].amount + buckets[3].amount)} sub={`${buckets[2].count + buckets[3].count} invoice${buckets[2].count + buckets[3].count === 1 ? "" : "s"}`} subTone={buckets[2].amount + buckets[3].amount > 0 ? "negative" : "muted"} />
        <KpiCard label="Paid, last 30 days" value={formatCurrency(paidLast30)} sub={`${paidLast30Count} invoice${paidLast30Count === 1 ? "" : "s"}`} subTone="positive" />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <FilterPills className="md:hidden" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoices or jobs" className="hidden md:flex md:max-w-xs" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading invoices…</p>}
      {isError && <p className="text-destructive">Failed to load invoices: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Job / client</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const late = lateLabel(inv);
                    return (
                      <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <td className="font-bold text-foreground">{inv.invoice_number ?? "—"}</td>
                        <td>
                          <div className="font-semibold text-foreground">{inv.project?.name ?? "Standalone"}</div>
                          <div className="text-xs text-muted-foreground">{inv.project?.client?.name ?? "—"}</div>
                        </td>
                        <td className="font-bold tabular-nums">{formatCurrency(Number(inv.amount))}</td>
                        <td>
                          {late ? (
                            <span className="badge-status badge-overdue">{late}</span>
                          ) : (
                            <StatusPill meta={invoiceStatusMeta(inv.status)} />
                          )}
                        </td>
                        <td className="text-muted-foreground">{inv.due_date?.slice(0, 10) ?? "—"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {inv.project_id && (
                                <DropdownMenuItem onClick={() => navigate(`/projects/${inv.project_id}`)}>
                                  Open project
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(inv.id)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">No invoices here.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((inv) => {
              const late = lateLabel(inv);
              const meta = invoiceStatusMeta(inv.status);
              const border = late ? "hsl(var(--destructive))" : meta.border;
              return (
                <ListCard
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  borderColor={border}
                  eyebrow={`${inv.invoice_number ?? "Invoice"} · ${late ?? meta.label}`}
                  eyebrowColor={border}
                  eyebrowRight={formatCurrency(Number(inv.amount))}
                  title={inv.project?.name ?? "Standalone"}
                  subtitle={`${inv.project?.client?.name ?? "—"}${inv.due_date ? ` · due ${inv.due_date.slice(0, 10)}` : ""}`}
                />
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No invoices here.</p>}
          </div>
        </>
      )}
    </div>
  );
}

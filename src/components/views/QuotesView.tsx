import { useMemo, useState } from "react";
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
import { QuoteActivityBadge } from "@/components/quote-activity/QuoteActivityBadge";
import { getNotificationSettings } from "@/lib/api";
import { ListCard } from "@/components/common/ListCard";
import { StatusPill } from "@/components/common/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import { listQuotes, createQuote, deleteQuote, quoteTotal, type QuoteStatus } from "@/lib/api";
import { quoteStatusMeta } from "@/lib/statusMeta";

/** "open" is a combined filter — draft + sent, i.e. not yet approved/declined/
 * expired. Same definition the Dashboard's own "Open quotes" KPI uses, so
 * arriving from that card shows the same count. */
type Filter = "all" | QuoteStatus | "open";
const VALID_FILTERS: Filter[] = ["all", "open", "draft", "sent", "approved"];

const clientOf = (q: { client?: { name: string } | null; project?: { client?: { name: string } | null } | null }) =>
  q.client?.name ?? q.project?.client?.name ?? "—";

export function QuotesView() {
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(
    VALID_FILTERS.includes(initialFilter as Filter) ? (initialFilter as Filter) : "all",
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: quotes = [], isLoading, isError, error } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => listQuotes(),
  });
  const { data: activitySettings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });

  const deleteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete quote", description: err.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: () => createQuote(),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  const withTotals = useMemo(
    () => quotes.map((q) => ({ q, total: quoteTotal(q.quote_sections) })),
    [quotes],
  );

  const sumByStatus = (s: QuoteStatus) =>
    withTotals.filter((x) => x.q.status === s).reduce((acc, x) => acc + x.total, 0);
  const countByStatus = (s: QuoteStatus) => quotes.filter((q) => q.status === s).length;
  const priced = withTotals.filter((x) => x.total > 0);
  const avgQuote = priced.length ? priced.reduce((a, x) => a + x.total, 0) / priced.length : 0;

  const openCount = countByStatus("draft") + countByStatus("sent");

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: quotes.length },
    { value: "open", label: "Open", count: openCount },
    { value: "draft", label: "Draft", count: countByStatus("draft") },
    { value: "sent", label: "Shared", count: countByStatus("sent") },
    { value: "approved", label: "Approved", count: countByStatus("approved") },
  ];

  const filtered = withTotals.filter(({ q }) => {
    if (filter === "open" ? q.status !== "draft" && q.status !== "sent" : filter !== "all" && q.status !== filter)
      return false;
    const term = search.toLowerCase();
    return (
      !term ||
      (q.project?.name ?? "").toLowerCase().includes(term) ||
      clientOf(q).toLowerCase().includes(term)
    );
  });

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader
        title="Quotes"
        subtitle={`${pluralize(quotes.length, "quote")} · ${formatCurrency(sumByStatus("sent"))} out for signature`}
        actions={
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="h-8 rounded-[0.625rem] bg-sidebar-primary px-3 text-[13px] font-bold text-sidebar-primary-foreground"
          >
            + New
          </button>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search quotes or clients"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Quotes"
        subtitle={`${pluralize(quotes.length, "quote")} · ${formatCurrency(sumByStatus("sent"))} out for signature · ${formatCurrency(sumByStatus("approved"))} approved`}
        actions={
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="font-bold"
          >
            + New quote
          </Button>
        }
      />

      {/* KPI cards — desktop */}
      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Out for signature" value={formatCurrency(sumByStatus("sent"))} sub={`${countByStatus("sent")} quotes`} />
        <KpiCard label="Approved" value={formatCurrency(sumByStatus("approved"))} sub={`${countByStatus("approved")} signed`} subTone="positive" />
        <KpiCard label="Avg. quote" value={formatCurrency(Math.round(avgQuote))} sub={`${priced.length} priced`} />
        <KpiCard label="Drafts" value={countByStatus("draft")} sub="not sent" />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <FilterPills className="md:hidden" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search quotes or clients"
          className="hidden md:flex md:max-w-xs"
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading quotes…</p>}
      {isError && <p className="text-destructive">Failed to load quotes: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quote</th>
                    <th>Client</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Client activity</th>
                    <th>Updated</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ q, total }) => (
                    <tr key={q.id} className="cursor-pointer" onClick={() => navigate(`/quotes/${q.id}`)}>
                      <td className="font-bold text-foreground">{q.project?.name ?? "Standalone quote"}</td>
                      <td className="text-muted-foreground">{clientOf(q)}</td>
                      <td className="font-bold tabular-nums">{total > 0 ? formatCurrency(total) : "—"}</td>
                      <td><StatusPill meta={quoteStatusMeta(q.status)} /></td>
                      <td><QuoteActivityBadge quote={q} settings={activitySettings} /></td>
                      <td className="text-muted-foreground">{q.updated_at.slice(0, 10)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {q.project_id && (
                              <DropdownMenuItem onClick={() => navigate(`/projects/${q.project_id}`)}>
                                Open project
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(q.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">No quotes here.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map(({ q, total }) => {
              const meta = quoteStatusMeta(q.status);
              return (
                <ListCard
                  key={q.id}
                  to={`/quotes/${q.id}`}
                  borderColor={meta.border}
                  eyebrow={meta.label}
                  eyebrowColor={meta.border}
                  eyebrowRight={total > 0 ? formatCurrency(total) : ""}
                  title={q.project?.name ?? "Standalone quote"}
                  subtitle={`${clientOf(q)} · updated ${q.updated_at.slice(0, 10)}`}
                >
                  <QuoteActivityBadge quote={q} settings={activitySettings} className="mt-1.5" />
                </ListCard>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No quotes here.</p>}
          </div>
        </>
      )}
    </div>
  );
}

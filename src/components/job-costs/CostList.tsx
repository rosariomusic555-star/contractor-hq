import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Filter, Pencil, Receipt, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchInput } from "@/components/common/SearchInput";
import { FeatureSelect } from "@/components/expenses/FeatureTypeSelects";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { getSignedImageUrls, updateExpense, type Category, type Expense, type ExpenseCategory } from "@/lib/api";
import type { ProjectFeature } from "@/lib/features";
import { COST_BUCKETS, COST_TYPE_LABEL, type CostBucket } from "@/lib/costPlanMath";
import { COST_SOURCE_LABEL, type CostRow, type CostSource } from "@/lib/jobCosts";
import type { CellFilter } from "./CostBreakdown";
import { cn, formatCurrency, formatDate, pluralize } from "@/lib/utils";

const ALL = "__all";
const GENERAL = "__general";

export interface ListFilters {
  feature: string; // ALL | GENERAL | feature id
  costType: string; // ALL | bucket
  category: string; // ALL | id
  vendor: string;
  source: string; // ALL | source
  from: string;
  to: string;
  unassigned: boolean;
  noReceipt: boolean;
  search: string;
}
const EMPTY_FILTERS: ListFilters = { feature: ALL, costType: ALL, category: ALL, vendor: "", source: ALL, from: "", to: "", unassigned: false, noReceipt: false, search: "" };

type SortKey = "date" | "amount" | "description";

/**
 * Every actual cost on the job — manual expenses (a split is one row that
 * expands to its lines), tracked deliveries and weekly labor — labelled by
 * source. Filters, sort, quick / bulk feature assignment for unassigned
 * expenses, receipt thumbnails.
 */
export function CostList({
  projectId,
  rows,
  expenses,
  features,
  categories,
  expenseCategories,
  cellFilter,
  onClearCellFilter,
  onEdit,
}: {
  projectId: string;
  rows: CostRow[];
  expenses: Expense[];
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  expenseCategories: ExpenseCategory[];
  cellFilter: CellFilter | null;
  onClearCellFilter: () => void;
  onEdit: (expense: Expense) => void;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<ListFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFeature, setBulkFeature] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const featureName = (id: string | null) => {
    if (!id) return "General";
    const feat = features.find((x) => x.id === id);
    if (!feat) return "General";
    const type = categories.find((c) => c.id === feat.category_id)?.name ?? "Feature";
    return feat.label && feat.label.toLowerCase() !== type.toLowerCase() ? `${type} · ${feat.label}` : type;
  };
  const categoryName = (id: string | null) => (id ? (expenseCategories.find((c) => c.id === id)?.name ?? "—") : "Uncategorized");
  const expenseById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);

  const receiptPaths = useMemo(() => [...new Set(rows.map((r) => r.receiptPath).filter(Boolean) as string[])], [rows]);
  const { data: receiptUrls = {} } = useQuery({
    queryKey: ["expense-receipt-urls", receiptPaths.join(",")],
    queryFn: () => getSignedImageUrls(receiptPaths),
    enabled: receiptPaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const vendors = useMemo(() => [...new Set(rows.map((r) => r.vendor?.trim()).filter(Boolean) as string[])].sort(), [rows]);

  // A row matches when it (or, for a split, one of its lines) matches.
  const matchOne = (r: CostRow) => {
    if (cellFilter) {
      if (cellFilter.featureId === "labor") {
        if (r.source !== "labor") return false;
      } else if (cellFilter.featureId !== undefined) {
        if (r.source === "labor") return false;
        if (r.source === "delivery") return false;
        if ((r.featureId ?? null) !== cellFilter.featureId) return false;
      }
      if (cellFilter.costType && r.costType !== cellFilter.costType) return false;
    }
    if (f.feature !== ALL) {
      if (r.source !== "expense") return false;
      if (f.feature === GENERAL ? r.featureId != null : r.featureId !== f.feature) return false;
    }
    if (f.costType !== ALL && r.costType !== f.costType) return false;
    if (f.category !== ALL && r.categoryId !== f.category) return false;
    return true;
  };
  const visible = useMemo(() => {
    const q = f.search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (f.source !== ALL && r.source !== f.source) return false;
      if (f.vendor && (r.vendor ?? "").trim() !== f.vendor) return false;
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (f.unassigned && !r.unassigned) return false;
      if (f.noReceipt && (r.source !== "expense" || r.receiptPath)) return false;
      if (q && !`${r.description} ${r.vendor ?? ""}`.toLowerCase().includes(q)) return false;
      return r.lines?.length ? r.lines.some(matchOne) : matchOne(r);
    });
    const val = (r: CostRow) => (sort.key === "date" ? r.date : sort.key === "amount" ? r.amount : r.description.toLowerCase());
    return out.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [rows, f, sort, cellFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = visible.reduce((s, r) => s + (r.inTotals ? r.amount : 0), 0);
  const activeFilterCount =
    [f.feature !== ALL, f.costType !== ALL, f.category !== ALL, !!f.vendor, f.source !== ALL, !!f.from, !!f.to, f.unassigned, f.noReceipt].filter(Boolean).length + (cellFilter ? 1 : 0);

  const assign = useMutation({
    mutationFn: async ({ ids, featureId }: { ids: string[]; featureId: string | null }) => {
      for (const id of ids) await updateExpense(id, { feature_id: featureId });
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected(new Set());
      toast({ title: `${pluralize(v.ids.length, "expense")} assigned to ${featureName(v.featureId)}` });
    },
    onError: (e: Error) => toast({ title: "Couldn't assign", description: e.message, variant: "destructive" }),
  });

  // Quick / bulk assign works on single (unsplit) expenses — a split's lines are set in its editor.
  const assignable = (r: CostRow) => r.source === "expense" && !r.lines?.length && r.unassigned;
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "description" ? 1 : -1 }));

  const filterControls = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select value={f.feature} onValueChange={(v) => setF({ ...f, feature: v })}>
        <SelectTrigger className="h-9" aria-label="Feature filter"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All features</SelectItem>
          <SelectItem value={GENERAL}>General</SelectItem>
          {features.map((x) => <SelectItem key={x.id} value={x.id}>{featureName(x.id)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={f.costType} onValueChange={(v) => setF({ ...f, costType: v })}>
        <SelectTrigger className="h-9" aria-label="Cost type filter"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All cost types</SelectItem>
          {COST_BUCKETS.map((b) => <SelectItem key={b} value={b}>{COST_TYPE_LABEL[b]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
        <SelectTrigger className="h-9" aria-label="Category filter"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={f.source} onValueChange={(v) => setF({ ...f, source: v })}>
        <SelectTrigger className="h-9" aria-label="Source filter"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sources</SelectItem>
          {(Object.keys(COST_SOURCE_LABEL) as CostSource[]).map((s) => <SelectItem key={s} value={s}>{COST_SOURCE_LABEL[s]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={f.vendor || ALL} onValueChange={(v) => setF({ ...f, vendor: v === ALL ? "" : v })}>
        <SelectTrigger className="h-9" aria-label="Vendor filter"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All vendors</SelectItem>
          {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-9" aria-label="From date" />
        <span className="text-xs text-muted-subtle">–</span>
        <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-9" aria-label="To date" />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <Checkbox checked={f.unassigned} onCheckedChange={(v) => setF({ ...f, unassigned: !!v })} /> Not assigned to a feature
      </label>
      <label className="flex h-9 items-center gap-2 text-sm">
        <Checkbox checked={f.noReceipt} onCheckedChange={(v) => setF({ ...f, noReceipt: !!v })} /> No receipt
      </label>
    </div>
  );

  const sourcePill = (r: CostRow) => (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", r.source === "expense" ? "bg-secondary text-foreground" : r.source === "labor" ? "bg-info/15 text-info" : "bg-primary/15 text-success")}>
      {COST_SOURCE_LABEL[r.source]}
    </span>
  );
  const thumb = (r: CostRow) =>
    r.receiptPath && receiptUrls[r.receiptPath] ? (
      <button type="button" onClick={() => setViewing(receiptUrls[r.receiptPath!])} aria-label="View receipt">
        <img src={receiptUrls[r.receiptPath]} alt="" className="h-9 w-9 rounded-md border border-border object-cover" />
      </button>
    ) : r.source === "expense" ? (
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border text-muted-subtle" title="No receipt">
        <Receipt className="h-3.5 w-3.5" />
      </span>
    ) : null;

  const quickAssign = (r: CostRow, className: string) =>
    assignable(r) ? (
      <FeatureSelect
        value={null}
        onChange={(v) => v && assign.mutate({ ids: [r.expenseId!], featureId: v })}
        features={features}
        categories={categories}
        className={className}
        ariaLabel="Assign feature"
      />
    ) : null;

  const actions = (r: CostRow, withAssign = false) => {
    if (r.source === "delivery")
      return (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Link to={`/projects/${projectId}/material-orders`}><ExternalLink className="mr-1 h-3.5 w-3.5" />Delivery</Link>
        </Button>
      );
    if (r.source === "labor")
      return (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Link to="/timesheets"><ExternalLink className="mr-1 h-3.5 w-3.5" />Timesheets</Link>
        </Button>
      );
    const e = r.expenseId ? expenseById.get(r.expenseId) : undefined;
    return (
      <div className="flex items-center gap-1">
        {withAssign && quickAssign(r, "h-8 w-36 text-xs")}
        {e && (
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit expense" onClick={() => onEdit(e)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  const typeLabel = (r: CostRow) => (r.lines?.length ? "Split" : r.costType ? COST_TYPE_LABEL[r.costType as CostBucket] : "—");
  const featLabel = (r: CostRow) => (r.source !== "expense" ? "—" : r.lines?.length ? `${new Set(r.lines.map((l) => l.featureId ?? "g")).size} features` : featureName(r.featureId));

  return (
    <section className="card-surface space-y-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">
          All costs <span className="text-muted-foreground">· {visible.length} · {formatCurrency(total)}</span>
        </h3>
        <div className="flex items-center gap-2">
          <SearchInput value={f.search} onChange={(v) => setF({ ...f, search: v })} placeholder="Search" className="w-44" />
          {isMobile && (
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
              <Filter className="mr-1 h-3.5 w-3.5" /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
            </Button>
          )}
        </div>
      </div>
      {!isMobile && filterControls}
      {(activeFilterCount > 0 || cellFilter) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {cellFilter && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-foreground">
              {cellFilter.featureId === "labor" ? "Labor (whole job)" : cellFilter.featureId !== undefined ? featureName(cellFilter.featureId as string | null) : ""}
              {cellFilter.costType ? `${cellFilter.featureId !== undefined ? " · " : ""}${COST_TYPE_LABEL[cellFilter.costType]}` : ""}
              <button type="button" aria-label="Clear breakdown filter" onClick={onClearCellFilter}><X className="h-3 w-3" /></button>
            </span>
          )}
          <button type="button" className="font-semibold text-primary" onClick={() => { setF(EMPTY_FILTERS); onClearCellFilter(); }}>Clear all</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <Tag className="h-4 w-4 text-success" />
          <span className="font-semibold">{pluralize(selected.size, "expense")} selected</span>
          <FeatureSelect value={bulkFeature} onChange={setBulkFeature} features={features} categories={categories} className="h-8 w-44" ariaLabel="Bulk feature" />
          <Button size="sm" disabled={!bulkFeature || assign.isPending} onClick={() => bulkFeature && assign.mutate({ ids: [...selected], featureId: bulkFeature })}>
            Assign
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancel</Button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No costs match.</p>
      ) : isMobile ? (
        <ul className="space-y-2">
          {visible.map((r) => {
            const open = expanded.has(r.key);
            return (
              <li key={r.key} className={cn("rounded-xl border border-border bg-card p-3", !r.inTotals && "opacity-80")}>
                <div className="flex items-start gap-3">
                  {thumb(r)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{r.description}</p>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(r.amount)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(r.date)}{r.vendor ? ` · ${r.vendor}` : ""} · {featLabel(r)} · {typeLabel(r)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {sourcePill(r)}
                      {r.unassigned && <span className="badge-status badge-pending">No feature</span>}
                    </div>
                    {r.note && <p className="mt-1 text-[11px] text-muted-subtle">{r.note}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {actions(r, true)}
                      {r.lines?.length ? (
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>
                          {open ? "Hide" : "Show"} {r.lines.length} lines
                        </Button>
                      ) : null}
                    </div>
                    {open && r.lines && (
                      <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
                        {r.lines.map((l) => (
                          <li key={l.key} className="flex justify-between gap-2 text-xs">
                            <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{l.description} · {featureName(l.featureId)} · {l.costType ? COST_TYPE_LABEL[l.costType] : ""}</span>
                            <span className="shrink-0 tabular-nums">{formatCurrency(l.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th className="w-8" />
                <th className="cursor-pointer" onClick={() => toggleSort("date")}>Date{sort.key === "date" ? (sort.dir < 0 ? " ↓" : " ↑") : ""}</th>
                <th className="cursor-pointer" onClick={() => toggleSort("description")}>Description{sort.key === "description" ? (sort.dir < 0 ? " ↓" : " ↑") : ""}</th>
                <th>Vendor</th>
                <th>Feature</th>
                <th>Type · category</th>
                <th className="cursor-pointer text-right" onClick={() => toggleSort("amount")}>Amount{sort.key === "amount" ? (sort.dir < 0 ? " ↓" : " ↑") : ""}</th>
                <th aria-label="Receipt" />
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const open = expanded.has(r.key);
                return [
                  <tr key={r.key} className={cn(!r.inTotals && "text-muted-foreground")}>
                    <td>
                      {assignable(r) ? (
                        <Checkbox
                          checked={selected.has(r.expenseId!)}
                          onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.expenseId!); else n.delete(r.expenseId!); return n; })}
                          aria-label="Select for bulk assign"
                        />
                      ) : r.lines?.length ? (
                        <button type="button" aria-label={open ? "Collapse lines" : "Expand lines"} onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{formatDate(r.date)}</td>
                    <td className="max-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        {sourcePill(r)}
                        <span className="min-w-0 truncate font-medium text-foreground" title={r.description}>{r.description}</span>
                      </div>
                      {r.note && <div className="mt-0.5 truncate text-[11px] text-muted-subtle" title={r.note}>{r.note}</div>}
                    </td>
                    <td className="max-w-[140px] truncate">{r.vendor ?? "—"}</td>
                    <td className="max-w-[170px] truncate">
                      {/* Unassigned: pick the feature right here (it reads "General" until then). */}
                      {assignable(r) ? quickAssign(r, "h-8 w-40 border-warning/60 text-xs") : featLabel(r)}
                    </td>
                    <td className="max-w-[150px]">
                      <div className="whitespace-nowrap">{typeLabel(r)}</div>
                      {r.source === "expense" && !r.lines?.length && <div className="truncate text-[11px] text-muted-subtle">{categoryName(r.categoryId)}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums text-foreground">{formatCurrency(r.amount)}</td>
                    <td>{thumb(r)}</td>
                    <td className="whitespace-nowrap">{actions(r)}</td>
                  </tr>,
                  ...(open && r.lines
                    ? r.lines.map((l) => (
                        <tr key={l.key} className="bg-muted/30 text-xs">
                          <td />
                          <td />
                          <td className="pl-8 text-muted-foreground">{l.description}</td>
                          <td />
                          <td>
                            {featureName(l.featureId)}
                            {l.unassigned && <span className="ml-1.5 badge-status badge-pending">None</span>}
                          </td>
                          <td>
                            {l.costType ? COST_TYPE_LABEL[l.costType] : "—"}
                            <div className="text-[11px] text-muted-subtle">{categoryName(l.categoryId)}</div>
                          </td>
                          <td className="text-right tabular-nums">{formatCurrency(l.amount)}</td>
                          <td />
                          <td />
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-5">
          <SheetHeader className="text-left"><SheetTitle>Filter costs</SheetTitle></SheetHeader>
          <div className="mt-3">{filterControls}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setF({ ...EMPTY_FILTERS, search: f.search })}>Reset</Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show {visible.length}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setViewing(null)} role="dialog" aria-label="Receipt">
          <img src={viewing} alt="Receipt" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </section>
  );
}

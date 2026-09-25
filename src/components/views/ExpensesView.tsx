import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { listExpenses, listExpenseCategories, deleteExpense, updateExpense, type Expense } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { ExpenseCategoryPill } from "@/components/expenses/ExpenseCategoryPill";
import { ExpenseSplitDialog } from "@/components/expenses/ExpenseSplitDialog";
import { expenseAmountForCategory, expenseCategoryAllocations, isSplitExpense } from "@/lib/expenseSplit";

const UNCATEGORIZED = "__uncategorized__";
const ALL = "__all__";
const DAY = 86_400_000;

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/**
 * Every expense across every project — the all-jobs rollup Quotes/Invoices
 * already have. Logging a new expense stays a per-project action
 * (ProjectExpensesView); this is a read + navigate + delete list.
 */
export function ExpensesView() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();

  const { data: expenses = [], isLoading, isError, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => listExpenses(),
  });
  const { data: categories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: listExpenseCategories });

  const recategorizeMut = useMutation({
    mutationFn: ({ id, expense_category_id }: { id: string; expense_category_id: string | null }) => updateExpense(id, { expense_category_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const redateMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | null }) => updateExpense(id, { date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const [splitExpense, setSplitExpense] = useState<Expense | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const last30 = expenses
    .filter((e) => e.date && now.getTime() - new Date(`${e.date}T00:00:00`).getTime() <= 30 * DAY)
    .reduce((s, e) => s + Number(e.amount), 0);

  // Category rollups use split line amounts (0096) — a split expense counts
  // under every category it has a share in (expenseCategoryAllocations).
  const inCategory = (e: Expense, catId: string | null) => expenseCategoryAllocations(e).some((a) => a.categoryId === catId);
  const countFor = (catId: string | null) => expenses.filter((e) => inCategory(e, catId)).length;

  const options: FilterOption<string>[] = [
    { value: ALL, label: "All", count: expenses.length },
    ...categories.map((c) => ({ value: c.id, label: c.name, count: countFor(c.id) })),
    { value: UNCATEGORIZED, label: "Uncategorized", count: countFor(null) },
  ];

  const categoryName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "—" : "Uncategorized");

  const term = search.toLowerCase();
  const filterCat = category === ALL ? undefined : category === UNCATEGORIZED ? null : category;
  // Amount shown for a row: its share in the filtered category (split
  // expenses), else the whole expense.
  const shownAmount = (e: Expense) => (filterCat === undefined ? Number(e.amount) : expenseAmountForCategory(e, filterCat));
  const filtered = expenses.filter((e) => {
    if (filterCat !== undefined && !inCategory(e, filterCat)) return false;
    return (
      !term ||
      e.name.toLowerCase().includes(term) ||
      (e.project?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader title="Expenses" subtitle={`${formatCurrency(total)} total`}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search expenses or jobs"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader title="Expenses" subtitle={`${formatCurrency(total)} total, all jobs`} />

      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total expenses" value={formatCurrency(total)} />
        <KpiCard label="Last 30 days" value={formatCurrency(last30)} />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSegment className="hidden md:inline-flex" options={options} value={category} onChange={setCategory} />
        <FilterPills className="md:hidden" options={options} value={category} onChange={setCategory} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search expenses or jobs" className="hidden md:flex md:max-w-xs" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading expenses…</p>}
      {isError && <p className="text-destructive">Failed to load expenses: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Job</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((expense) => (
                    <tr key={expense.id} className="cursor-pointer" onClick={() => expense.project_id && navigate(`/projects/${expense.project_id}/expenses`)}>
                      <td className="font-semibold text-foreground">{expense.name || "Expense"}</td>
                      <td className="text-muted-foreground">{expense.project?.name ?? "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ExpenseCategoryPill
                          expense={expense}
                          categories={categories}
                          onRecategorize={(expense_category_id) => recategorizeMut.mutate({ id: expense.id, expense_category_id })}
                          onSplit={() => setSplitExpense(expense)}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {/* Inline date — saves as soon as it changes. */}
                        <Input
                          type="date"
                          aria-label={`Date of ${expense.name || "expense"}`}
                          value={expense.date ?? ""}
                          onChange={(e) => redateMut.mutate({ id: expense.id, date: e.target.value || null })}
                          className="h-8 w-[9.5rem] px-2 text-xs"
                        />
                      </td>
                      <td className="font-bold tabular-nums">
                        {formatCurrency(shownAmount(expense))}
                        {filterCat !== undefined && isSplitExpense(expense) && (
                          <span className="block text-[11px] font-medium text-muted-foreground">of {formatCurrency(Number(expense.amount))}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {expense.project_id && (
                              <DropdownMenuItem onClick={() => navigate(`/projects/${expense.project_id}`)}>
                                Open project
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate(expense.id)}>
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
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No expenses here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((expense: Expense) => (
              <ListCard
                key={expense.id}
                to={expense.project_id ? `/projects/${expense.project_id}/expenses` : undefined}
                eyebrow={isSplitExpense(expense) ? `Split · ${expense.expense_lines!.length} lines` : categoryName(expense.expense_category_id)}
                eyebrowRight={formatCurrency(shownAmount(expense))}
                title={expense.name || "Expense"}
                subtitle={`${expense.project?.name ?? "—"} · ${formatDate(expense.date)}`}
              />
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No expenses here.</p>}
          </div>
        </>
      )}
      {splitExpense && (
        <ExpenseSplitDialog
          open={!!splitExpense}
          onOpenChange={(open) => !open && setSplitExpense(null)}
          expense={splitExpense}
          categories={categories}
          invalidateKeys={[["expenses"]]}
        />
      )}
    </div>
  );
}

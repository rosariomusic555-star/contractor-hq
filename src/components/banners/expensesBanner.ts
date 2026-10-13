import { CalendarDays, FolderTree, Receipt, Tags } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import type { Expense, ExpenseCategory } from "@/lib/api";
import { expenseCategoryAllocations } from "@/lib/expenseSplit";
import { changeLabel, compactMoney, count, inLastDays, inMonth, monthlySeries } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

/** Every expense belongs to a project (project_id is required), so the
 *  spec's "not assigned to a project" chip has no data and is skipped. */
export type ExpenseChip = "uncategorized" | "no_receipt";

type Exp = Pick<Expense, "amount" | "date" | "created_at" | "expense_category_id" | "expense_lines" | "receipt_path">;

/** When the money was spent: its date, else when it was entered. */
const spentOn = (e: Exp) => e.date ?? e.created_at;
const uncategorizedAmount = (e: Exp) => expenseCategoryAllocations(e).find((a) => a.categoryId === null)?.amount ?? 0;

export function expenseChipMatch(e: Exp, chip: ExpenseChip): boolean {
  return chip === "uncategorized" ? uncategorizedAmount(e) > 0 : !e.receipt_path;
}

export function expenseBannerStats(expenses: Exp[], now: Date) {
  const sum = (rows: Exp[]) => rows.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = new Map<string, number>();
  for (const e of expenses)
    if (inLastDays(spentOn(e), 90, now))
      for (const a of expenseCategoryAllocations(e)) if (a.categoryId) byCat.set(a.categoryId, (byCat.get(a.categoryId) ?? 0) + a.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const uncategorized = expenses.filter((e) => expenseChipMatch(e, "uncategorized"));
  return {
    total: expenses.length,
    month: sum(expenses.filter((e) => inMonth(spentOn(e), now))),
    lastMonth: sum(expenses.filter((e) => inMonth(spentOn(e), now, -1))),
    last30: sum(expenses.filter((e) => inLastDays(spentOn(e), 30, now))),
    series: monthlySeries(expenses, spentOn, (e) => Number(e.amount), now),
    topCategory: top,
    uncategorizedCount: uncategorized.length,
    uncategorizedAmount: uncategorized.reduce((s, e) => s + uncategorizedAmount(e), 0),
    noReceipt: expenses.filter((e) => expenseChipMatch(e, "no_receipt")).length,
  };
}

export function useExpensesBanner({
  expenses,
  categories,
  loading,
  chip,
  setChip,
  setCategory,
  allValue,
  uncategorizedValue,
}: {
  expenses: Exp[];
  categories: Pick<ExpenseCategory, "id" | "name">[];
  loading: boolean;
  chip: ExpenseChip | null;
  setChip: (c: ExpenseChip | null) => void;
  setCategory: (c: string) => void;
  allValue: string;
  uncategorizedValue: string;
}): { rich: RichBanner; matches: (e: Exp) => boolean } {
  const now = new Date();
  const st = expenseBannerStats(expenses, now);
  const topName = st.topCategory ? categories.find((c) => c.id === st.topCategory![0])?.name ?? null : null;

  let insight: string;
  if (st.total === 0) insight = "No expenses yet — add one from a project";
  else
    insight = [
      st.month ? `${compactMoney(st.month)} spent this month` : "Nothing spent this month yet",
      st.uncategorizedCount ? `${st.uncategorizedCount} uncategorized` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const go = (cat: string) => {
    setChip(null);
    setCategory(cat);
  };
  const rich: RichBanner = {
    insight,
    loading,
    listId: "expenses-list",
    activeChip: chip,
    onChip: (k) => {
      setChip(k as ExpenseChip | null);
      if (k) setCategory(allValue);
    },
    chips: [
      { key: "uncategorized", label: "uncategorized", count: st.uncategorizedCount },
      { key: "no_receipt", label: st.noReceipt === 1 ? "missing a receipt" : "missing receipts", count: st.noReceipt },
    ],
    tiles: [
      {
        key: "month",
        label: "This month",
        icon: Receipt,
        value: st.total ? formatCurrency(st.month) : "—",
        sub: st.total ? changeLabel(st.month, st.lastMonth, "last month") ?? "nothing last month" : "Add an expense to see this",
        onClick: () => go(allValue),
      },
      {
        key: "last30",
        label: "Last 30 days",
        icon: CalendarDays,
        value: st.total ? formatCurrency(st.last30) : "—",
        sub: st.total ? "across all jobs" : "Spending shows here",
        visual: st.series.some((v) => v > 0) ? { kind: "spark", points: st.series } : undefined,
        onClick: () => go(allValue),
      },
      {
        key: "top",
        label: "Biggest category",
        icon: FolderTree,
        value: topName ?? "—",
        sub: st.topCategory ? `${formatCurrency(st.topCategory[1])}, last 90 days` : st.total ? "Categorize expenses to see this" : "Shows once you have expenses",
        onClick: st.topCategory ? () => go(st.topCategory![0]) : undefined,
      },
      {
        key: "uncat",
        label: "Uncategorized",
        icon: Tags,
        value: st.total ? String(st.uncategorizedCount) : "—",
        sub: st.uncategorizedCount ? formatCurrency(st.uncategorizedAmount) : st.total ? "Everything has a category" : "Shows once you have expenses",
        subTone: st.total && !st.uncategorizedCount ? "positive" : "muted",
        onClick: () => go(uncategorizedValue),
      },
    ],
  };
  return { rich, matches: (e) => !chip || expenseChipMatch(e, chip) };
}

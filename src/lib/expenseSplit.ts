import type { Expense } from "./api";

/** Two or more lines = a split expense (0096). */
export const isSplitExpense = (e: Pick<Expense, "expense_lines">) => (e.expense_lines?.length ?? 0) >= 2;

/**
 * How an expense's amount divides across categories — the one helper every
 * category rollup (Expenses page filters/counts/amounts) goes through.
 * A normal expense: its whole amount under its one category. A split
 * expense: each line's amount under its line's category, plus any
 * unallocated remainder under Uncategorized (null), so the parts always
 * add back up to the expense total.
 */
export function expenseCategoryAllocations(
  e: Pick<Expense, "amount" | "expense_category_id" | "expense_lines">,
): { categoryId: string | null; amount: number }[] {
  const total = Number(e.amount) || 0;
  if (!isSplitExpense(e)) return [{ categoryId: e.expense_category_id, amount: total }];
  const byCategory = new Map<string | null, number>();
  let allocated = 0;
  for (const l of e.expense_lines!) {
    const amt = Number(l.amount) || 0;
    allocated += amt;
    byCategory.set(l.expense_category_id, (byCategory.get(l.expense_category_id) ?? 0) + amt);
  }
  const remainder = Math.round((total - allocated) * 100) / 100;
  if (remainder !== 0) byCategory.set(null, (byCategory.get(null) ?? 0) + remainder);
  return [...byCategory].map(([categoryId, amount]) => ({ categoryId, amount }));
}

/** An expense's amount under one category (0 if none). */
export function expenseAmountForCategory(
  e: Pick<Expense, "amount" | "expense_category_id" | "expense_lines">,
  categoryId: string | null,
): number {
  return expenseCategoryAllocations(e)
    .filter((a) => a.categoryId === categoryId)
    .reduce((s, a) => s + a.amount, 0);
}

/** Allocated vs. total for the split editor's running check. */
export function splitAllocation(total: number, lineAmounts: number[]) {
  const allocated = Math.round(lineAmounts.reduce((s, a) => s + (Number(a) || 0), 0) * 100) / 100;
  const remainder = Math.round((total - allocated) * 100) / 100;
  return { allocated, remainder, balanced: remainder === 0 };
}

import { describe, expect, it } from "vitest";
import { expenseAmountForCategory, expenseCategoryAllocations, isSplitExpense, splitAllocation } from "./expenseSplit";

const line = (cat: string | null, amount: number) =>
  ({ id: Math.random().toString(), expense_id: "e", expense_category_id: cat, amount, description: null, sort_order: 0 });

describe("expense split", () => {
  it("a single-category expense is untouched", () => {
    const e = { amount: 500, expense_category_id: "pavers", expense_lines: [] };
    expect(isSplitExpense(e)).toBe(false);
    expect(expenseCategoryAllocations(e)).toEqual([{ categoryId: "pavers", amount: 500 }]);
  });

  it("a split expense uses line amounts, remainder → Uncategorized", () => {
    const e = { amount: 1000, expense_category_id: null, expense_lines: [line("pavers", 600), line("gravel", 300)] };
    expect(isSplitExpense(e)).toBe(true);
    expect(expenseAmountForCategory(e, "pavers")).toBe(600);
    expect(expenseAmountForCategory(e, "gravel")).toBe(300);
    expect(expenseAmountForCategory(e, null)).toBe(100);
    expect(expenseCategoryAllocations(e).reduce((s, a) => s + a.amount, 0)).toBe(1000);
  });

  it("merges lines in the same category", () => {
    const e = { amount: 300, expense_category_id: null, expense_lines: [line("sand", 100), line("sand", 200)] };
    expect(expenseCategoryAllocations(e)).toEqual([{ categoryId: "sand", amount: 300 }]);
  });

  it("running allocated vs total", () => {
    expect(splitAllocation(1000, [600, 300])).toEqual({ allocated: 900, remainder: 100, balanced: false });
    expect(splitAllocation(1000, [600, 400])).toEqual({ allocated: 1000, remainder: 0, balanced: true });
    expect(splitAllocation(100.1, [0.1, 100])).toEqual({ allocated: 100.1, remainder: 0, balanced: true });
  });
});

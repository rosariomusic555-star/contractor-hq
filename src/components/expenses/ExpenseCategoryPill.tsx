import { Split } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@/lib/api";
import { isSplitExpense } from "@/lib/expenseSplit";

const NONE = "__none__";
const SPLIT = "__split__";

const PILL =
  "h-7 w-auto min-w-0 max-w-full gap-1.5 rounded-full border-none bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 focus:ring-0 focus:ring-offset-0";

/**
 * An expense's category as a compact pill (0096):
 * - one category → a dropdown to recategorize, plus "Split across
 *   categories…" to divide it into line items;
 * - split → a "Split · N categories" chip that reopens the split editor.
 */
export function ExpenseCategoryPill({
  expense,
  categories,
  onRecategorize,
  onSplit,
  className,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  onRecategorize: (categoryId: string | null) => void;
  onSplit: () => void;
  className?: string;
}) {
  if (isSplitExpense(expense)) {
    const names = [
      ...new Set(
        expense.expense_lines!.map((l) => categories.find((c) => c.id === l.expense_category_id)?.name ?? "Uncategorized"),
      ),
    ];
    return (
      <button
        type="button"
        onClick={onSplit}
        title={names.join(", ")}
        className={cn("inline-flex items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/15", PILL, "bg-primary/10 text-primary", className)}
      >
        <Split className="h-3 w-3 shrink-0" />
        <span className="truncate">Split · {names.length} {names.length === 1 ? "category" : "categories"}</span>
      </button>
    );
  }
  return (
    <Select
      value={expense.expense_category_id ?? NONE}
      onValueChange={(v) => (v === SPLIT ? onSplit() : onRecategorize(v === NONE ? null : v))}
    >
      <SelectTrigger aria-label="Category" className={cn(PILL, className)}>
        <SelectValue placeholder="Uncategorized" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Uncategorized</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={SPLIT}>Split across categories…</SelectItem>
      </SelectContent>
    </Select>
  );
}

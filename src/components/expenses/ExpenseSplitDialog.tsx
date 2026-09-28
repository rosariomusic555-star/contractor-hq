import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { saveExpenseLines, type Category, type Expense, type ExpenseCategory } from "@/lib/api";
import type { CostBucket } from "@/lib/costPlanMath";
import type { ProjectFeature } from "@/lib/features";
import { expenseBucket } from "@/lib/costPlan";
import { CostTypeSelect, FeatureSelect } from "@/components/expenses/FeatureTypeSelects";
import { splitAllocation } from "@/lib/expenseSplit";
import { parseDecimal } from "@/lib/parseDecimal";

const NONE = "__none__";

interface DraftLine {
  key: string;
  categoryId: string | null;
  amount: string;
  description: string;
  featureId: string | null;
  costType: CostBucket | null;
}

const newKey = () => crypto.randomUUID();

/**
 * "Split into line items" — the detail view of one expense (0096): a dollar
 * amount per category line, with a running allocated-vs-total check, a
 * warning when they don't add up, and a one-click "put the remainder in
 * the last line". Nothing is written until Save. Saving 0–1 lines turns it
 * back into a normal single-category expense.
 */
export function ExpenseSplitDialog({
  open,
  onOpenChange,
  expense,
  categories,
  invalidateKeys,
  features,
  jobCategories = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense;
  categories: ExpenseCategory[];
  /** The project's active features — a line per feature (e.g. one supplier
   * invoice across the patio and the fire pit). Omitted: no feature picker. */
  features?: ProjectFeature[];
  jobCategories?: Category[];
  /** Queries to refresh after saving (the page's expense lists). */
  invalidateKeys: unknown[][];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const total = Number(expense.amount) || 0;
  const [lines, setLines] = useState<DraftLine[]>([]);

  // Seed from the existing split, else start from its current category and
  // a second empty line (the user chose to split).
  useEffect(() => {
    if (!open) return;
    const existing = expense.expense_lines ?? [];
    setLines(
      existing.length >= 2
        ? existing.map((l) => ({
            key: l.id,
            categoryId: l.expense_category_id,
            amount: String(l.amount),
            description: l.description ?? "",
            featureId: l.feature_id ?? null,
            costType: l.cost_type ?? null,
          }))
        : [
            {
              key: newKey(),
              categoryId: expense.expense_category_id,
              amount: String(total),
              description: "",
              featureId: expense.feature_id ?? null,
              costType: expense.cost_type ?? null,
            },
            { key: newKey(), categoryId: null, amount: "", description: "", featureId: null, costType: null },
          ],
    );
  }, [open, expense, total]);

  const { allocated, remainder, balanced } = splitAllocation(
    total,
    lines.map((l) => parseDecimal(l.amount) ?? 0),
  );
  const pct = total > 0 ? Math.min(100, (allocated / total) * 100) : 0;

  const edit = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const fillRemainder = () =>
    setLines((ls) => {
      if (ls.length === 0) return ls;
      const last = ls[ls.length - 1];
      const next = Math.round(((parseDecimal(last.amount) ?? 0) + remainder) * 100) / 100;
      return [...ls.slice(0, -1), { ...last, amount: String(next) }];
    });

  const saveMut = useMutation({
    mutationFn: () =>
      saveExpenseLines(
        expense.id,
        lines
          .filter((l) => (parseDecimal(l.amount) ?? 0) !== 0 || l.categoryId)
          .map((l) => ({
            expense_category_id: l.categoryId,
            amount: parseDecimal(l.amount) ?? 0,
            description: l.description.trim() || null,
            feature_id: l.featureId,
            cost_type: l.costType,
          })),
      ),
    onSuccess: () => {
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
      toast({ title: lines.length >= 2 ? "Expense split saved" : "Expense updated" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-5 overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>Split “{expense.name || "Expense"}”</DialogTitle>
          <DialogDescription>
            {formatCurrency(total)} total — give each category its share. Reports and category totals use these amounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-[1fr_7.5rem_auto] items-center gap-2 rounded-xl border border-hairline p-2.5 sm:grid-cols-[1.2fr_7.5rem_1.4fr_auto]">
              <Select value={l.categoryId ?? NONE} onValueChange={(v) => edit(l.key, { categoryId: v === NONE ? null : v })}>
                <SelectTrigger aria-label={`Line ${i + 1} category`} className="h-10">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Line ${i + 1} amount`}
                  value={l.amount}
                  onChange={(e) => edit(l.key, { amount: e.target.value })}
                  className="h-10 pl-6 tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-subtle hover:bg-destructive/10 hover:text-destructive sm:order-last"
                aria-label={`Remove line ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Input
                aria-label={`Line ${i + 1} description`}
                value={l.description}
                onChange={(e) => edit(l.key, { description: e.target.value })}
                placeholder="Description (optional)"
                className="col-span-3 h-10 sm:col-span-1"
              />
              <div className={cn("col-span-3 grid gap-2 sm:col-span-4", features ? "grid-cols-2" : "grid-cols-1")}>
                {features && (
                  <FeatureSelect
                    value={l.featureId}
                    onChange={(featureId) => edit(l.key, { featureId })}
                    features={features}
                    categories={jobCategories}
                    ariaLabel={`Line ${i + 1} feature`}
                  />
                )}
                <CostTypeSelect
                  value={l.costType}
                  onChange={(costType) => edit(l.key, { costType })}
                  categoryType={l.categoryId ? expenseBucket(l.categoryId, categories) : null}
                  ariaLabel={`Line ${i + 1} cost type`}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: newKey(), categoryId: null, amount: "", description: "", featureId: null, costType: null }])}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add line
          </Button>
        </div>

        {/* Running allocated vs. total */}
        <div className={cn("rounded-xl p-3.5", balanced ? "bg-success/10" : "bg-warning/15")}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              Allocated {formatCurrency(allocated)} of {formatCurrency(total)}
            </span>
            {balanced ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Adds up
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-warning-strong">
                <AlertTriangle className="h-3.5 w-3.5" />
                {remainder > 0 ? `${formatCurrency(remainder)} left` : `${formatCurrency(-remainder)} over`}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70">
            <div className={cn("h-full rounded-full", balanced ? "bg-success" : "bg-warning-strong")} style={{ width: `${pct}%` }} />
          </div>
          {!balanced && lines.length > 0 && (
            <button type="button" onClick={fillRemainder} className="mt-2 text-xs font-bold text-primary hover:underline">
              {remainder > 0 ? `Put the remaining ${formatCurrency(remainder)} in the last line` : `Take ${formatCurrency(-remainder)} off the last line`}
            </button>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-bold" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? "Saving…" : !balanced ? "Save anyway" : "Save split"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getProject,
  listExpenses,
  listExpenseCategories,
  createExpense,
  updateExpense,
  deleteExpense,
  logProjectEvent,
  listProjectFeatures,
  listCategories,
  type Category,
  type Expense,
  type ExpenseCategory,
} from "@/lib/api";
import { activeFeatures, type ProjectFeature } from "@/lib/features";
import { expenseBucket } from "@/lib/costPlan";
import type { CostBucket } from "@/lib/costPlanMath";
import { CostTypeSelect, FeatureSelect } from "@/components/expenses/FeatureTypeSelects";
import { BackLink } from "@/components/common/BackLink";
import { ExpenseCategoryPill } from "@/components/expenses/ExpenseCategoryPill";
import { ExpenseSplitDialog } from "@/components/expenses/ExpenseSplitDialog";

const NONE = "__none__";

// Reference only, per spec — appended with a local midnight so a date-only
// string ("2026-09-15") isn't parsed as UTC midnight and shown a day early.
const formatDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

export function ProjectExpensesView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [costType, setCostType] = useState<CostBucket | null>(null);

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: expenses = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["expenses", { project: id }],
    queryFn: () => listExpenses(id),
  });
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });
  // Spend by feature (0105) — only active features (a proposed add-on's
  // can't have spend yet).
  const { data: allFeatures = [] } = useQuery({ queryKey: ["project-features", id], queryFn: () => listProjectFeatures(id) });
  const features = activeFeatures(allFeatures);
  const { data: jobCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["expenses", { project: id }] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: () =>
      createExpense({
        project_id: id,
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        date: date || null,
        expense_category_id: categoryId,
        feature_id: featureId,
        cost_type: costType,
      }),
    onSuccess: (expense) => {
      invalidate();
      void logProjectEvent(
        id,
        "expense_logged",
        `Expense: ${expense.name || "unnamed"} · ${formatCurrency(Number(expense.amount))}`,
      );
      qc.invalidateQueries({ queryKey: ["project-events", id] });
      setName("");
      setAmount("");
      setDate("");
      setCategoryId(null);
      setFeatureId(null);
      setCostType(null);
    },
    onError,
  });

  const retagMut = useMutation({
    mutationFn: ({ expenseId, patch }: { expenseId: string; patch: { feature_id?: string | null; cost_type?: CostBucket | null } }) =>
      updateExpense(expenseId, patch),
    onSuccess: invalidate,
    onError,
  });

  const recategorizeMut = useMutation({
    mutationFn: ({ expenseId, expense_category_id }: { expenseId: string; expense_category_id: string | null }) =>
      updateExpense(expenseId, { expense_category_id }),
    onSuccess: invalidate,
    onError,
  });

  const redateMut = useMutation({
    mutationFn: ({ expenseId, date }: { expenseId: string; date: string | null }) => updateExpense(expenseId, { date }),
    onSuccess: invalidate,
    onError,
  });
  const [splitExpense, setSplitExpense] = useState<Expense | null>(null);

  const deleteMut = useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: invalidate,
    onError,
  });

  const canSave = name.trim().length > 0 && amount.trim().length > 0 && !Number.isNaN(parseFloat(amount));
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <BackLink
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >Back to project</BackLink>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Expenses</h1>
        <p className="text-muted-foreground mt-1">{project?.name ?? " "}</p>
      </div>

      <div className="stat-card space-y-3">
        <h2 className="font-medium text-foreground">Add expense</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="expense-name">Name</Label>
            <Input
              id="expense-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gravel delivery"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="expense-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-6"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-category">Category (optional)</Label>
            <Select
              value={categoryId ?? NONE}
              onValueChange={(v) => setCategoryId(v === NONE ? null : v)}
            >
              <SelectTrigger id="expense-category" aria-label="Category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorized</SelectItem>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => addMut.mutate()}
            disabled={!canSave || addMut.isPending}
            className="font-bold"
          >
            {addMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Feature</Label>
            <FeatureSelect value={featureId} onChange={setFeatureId} features={features} categories={jobCategories} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost type</Label>
            <CostTypeSelect
              value={costType}
              onChange={setCostType}
              categoryType={categoryId ? expenseBucket(categoryId, expenseCategories) : null}
            />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading expenses…</p>}
      {isError && (
        <p className="text-destructive">Failed to load expenses: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && expenses.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No expenses logged yet. Add your first expense above.</p>
        </div>
      )}

      {!isLoading && !isError && expenses.length > 0 && (
        <div className="stat-card overflow-hidden p-0">
          {/* Rows, not a table: on a phone each expense stacks (name + amount,
              then category / date / delete) instead of scrolling sideways. */}
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_9.5rem_7rem_2.5rem] gap-3 border-b border-hairline px-4 py-2 text-xs text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Category</span>
            <span>Date</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="divide-y divide-hairline">
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                expenseCategories={expenseCategories}
                onRecategorize={(expense_category_id) => recategorizeMut.mutate({ expenseId: expense.id, expense_category_id })}
                onDateChange={(date) => redateMut.mutate({ expenseId: expense.id, date })}
                onSplit={() => setSplitExpense(expense)}
                onDelete={() => deleteMut.mutate(expense.id)}
                features={features}
                jobCategories={jobCategories}
                onRetag={(patch) => retagMut.mutate({ expenseId: expense.id, patch })}
              />
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 font-semibold text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {splitExpense && (
        <ExpenseSplitDialog
          open={!!splitExpense}
          onOpenChange={(open) => !open && setSplitExpense(null)}
          expense={splitExpense}
          categories={expenseCategories}
          features={features}
          jobCategories={jobCategories}
          invalidateKeys={[["expenses"]]}
        />
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  expenseCategories,
  onRecategorize,
  onDateChange,
  onSplit,
  onDelete,
  features,
  jobCategories,
  onRetag,
}: {
  expense: Expense;
  expenseCategories: ExpenseCategory[];
  onRecategorize: (expense_category_id: string | null) => void;
  onDateChange: (date: string | null) => void;
  onSplit: () => void;
  onDelete: () => void;
  features: ProjectFeature[];
  jobCategories: Category[];
  onRetag: (patch: { feature_id?: string | null; cost_type?: CostBucket | null }) => void;
}) {
  const split = (expense.expense_lines ?? []).length > 1;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_9.5rem_7rem_2.5rem] sm:py-2">
      <span className="min-w-0 truncate font-medium text-foreground">{expense.name}</span>
      <span className="text-right font-semibold tabular-nums text-foreground sm:order-4">{formatCurrency(Number(expense.amount))}</span>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:order-2 sm:col-span-1">
        <ExpenseCategoryPill expense={expense} categories={expenseCategories} onRecategorize={onRecategorize} onSplit={onSplit} />
      </div>
      {/* Inline date — saves as soon as it changes. */}
      <Input
        type="date"
        aria-label={`Date of ${expense.name}`}
        value={expense.date ?? ""}
        onChange={(e) => onDateChange(e.target.value || null)}
        className="h-8 w-[9.5rem] px-2 text-xs sm:order-3"
      />
      <div className="flex justify-end sm:order-5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${expense.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{expense.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {/* Feature + cost type (a split expense sets them per line). */}
      {split ? (
        <p className="col-span-2 text-xs text-muted-foreground sm:order-6 sm:col-span-5">Split — feature and type are set per line.</p>
      ) : (
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:order-6 sm:col-span-5 sm:max-w-md">
          <FeatureSelect
            value={expense.feature_id}
            onChange={(feature_id) => onRetag({ feature_id })}
            features={features}
            categories={jobCategories}
            className="h-8 text-xs"
            ariaLabel={`Feature for ${expense.name}`}
          />
          <CostTypeSelect
            value={expense.cost_type}
            onChange={(cost_type) => onRetag({ cost_type })}
            categoryType={expense.expense_category_id ? expenseBucket(expense.expense_category_id, expenseCategories) : null}
            className="h-8 text-xs"
            ariaLabel={`Cost type for ${expense.name}`}
          />
        </div>
      )}
    </li>
  );
}

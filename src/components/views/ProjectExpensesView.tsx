import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createExpense,
  deleteExpense,
  logProjectEvent,
  type Expense,
} from "@/lib/api";

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ["expenses", { project: id }] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: () =>
      createExpense({
        project_id: id,
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        date: date || null,
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
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: invalidate,
    onError,
  });

  const canSave = name.trim().length > 0 && amount.trim().length > 0 && !Number.isNaN(parseFloat(amount));
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Expenses</h1>
        <p className="text-muted-foreground mt-1">{project?.name ?? " "}</p>
      </div>

      <div className="stat-card space-y-3">
        <h2 className="font-medium text-foreground">Add expense</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-3 sm:items-end">
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
          <Button
            onClick={() => addMut.mutate()}
            disabled={!canSave || addMut.isPending}
            className="font-bold"
          >
            {addMut.isPending ? "Saving…" : "Save"}
          </Button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="py-2 px-4 font-medium">Name</th>
                  <th className="py-2 px-4 font-medium">Date</th>
                  <th className="py-2 px-4 font-medium text-right">Amount</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onDelete={() => deleteMut.mutate(expense.id)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold text-foreground">
                  <td className="py-2 px-4" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 px-4 text-right">{formatCurrency(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ expense, onDelete }: { expense: Expense; onDelete: () => void }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 px-4 text-foreground">{expense.name}</td>
      <td className="py-2 px-4 text-muted-foreground">{formatDate(expense.date)}</td>
      <td className="py-2 px-4 text-right text-foreground whitespace-nowrap">
        {formatCurrency(Number(expense.amount))}
      </td>
      <td className="py-2 px-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{expense.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

import { Check, Loader2, Receipt, X } from "lucide-react";
import { MoneyRow } from "@/components/common/MoneyRow";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useAssistant } from "./assistant-context";
import type { AssistantPendingAction } from "./assistant-context";

/**
 * Confirm/cancel card for a proposed write action, rendered directly under
 * the assistant's text bubble for that turn. Confirming and cancelling are
 * the only ways this ever leads to a database write — see
 * AssistantProvider's confirmAction/cancelAction and index.ts's
 * execute_action mode, which is the only code path that actually writes.
 */
export function AssistantActionCard({ messageId, pending }: { messageId: string; pending: AssistantPendingAction }) {
  const { confirmAction, cancelAction } = useAssistant();
  const { action, status, error } = pending;

  return (
    <div className="mt-2 w-full max-w-[85%] rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Receipt className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-bold text-foreground">Log new expense</h3>
      </div>

      <div className="space-y-0">
        <MoneyRow label="Project" value={action.project_name} />
        <MoneyRow label="Amount" value={formatCurrency(action.amount)} />
        <MoneyRow label="Category" value={action.category_name ?? "Uncategorized"} />
        <MoneyRow
          label="Date"
          value={action.date_was_defaulted ? `${action.date} (defaulted to today)` : action.date}
        />
      </div>

      {status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => cancelAction(messageId)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" onClick={() => void confirmAction(messageId)}>
            Confirm
          </Button>
        </div>
      )}

      {status === "confirming" && (
        <div className="mt-3 flex h-11 items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Adding…
        </div>
      )}

      {status === "confirmed" && (
        <div className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg bg-success/15 text-sm font-semibold text-success">
          <Check className="h-4 w-4" />
          Added
        </div>
      )}

      {status === "cancelled" && (
        <div className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
          <X className="h-4 w-4" />
          Cancelled
        </div>
      )}

      {status === "failed" && (
        <div className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
          {error ?? "That couldn't be saved."}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { listUsageLogsForItem, updateUsageLog, deleteUsageLog, type MaterialsItem, type MaterialsUsageLog } from "@/lib/api";
import { materialLineLabel } from "@/lib/materialsMath";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

interface UsageLogHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Pick<MaterialsItem, "id" | "name" | "unit">;
}

/** Phase 3's "edited or deleted, with the change kept in the history" —
 * every entry against this line, editable inline (quantity only — note
 * stays fixed once logged) or deletable; both write an audit row
 * (materials_usage_log_events, via updateUsageLog/deleteUsageLog in
 * api.ts) that this dialog doesn't need to render itself, just guarantee
 * exists. */
function UsageLogHistoryDialogInner({ open, onOpenChange, line }: UsageLogHistoryDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: logs = [] } = useQuery({
    queryKey: ["materials-usage-logs-for-item", line.id],
    queryFn: () => listUsageLogsForItem(line.id),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["materials-usage-logs"] });
    qc.invalidateQueries({ queryKey: ["materials-usage-logs-for-item", line.id] });
    qc.invalidateQueries({ queryKey: ["materials"] });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => updateUsageLog(id, { quantity }),
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUsageLog(id),
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[75vh] max-w-md gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Usage log — {materialLineLabel(line)}</DialogTitle>
        </DialogHeader>
        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No usage logged yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <UsageLogRow
                key={log.id}
                log={log}
                unit={line.unit}
                onSave={(quantity) => updateMut.mutate({ id: log.id, quantity })}
                onDelete={() => deleteMut.mutate(log.id)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UsageLogRow({
  log,
  unit,
  onSave,
  onDelete,
}: {
  log: MaterialsUsageLog;
  unit: string | null;
  onSave: (quantity: number) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qtyStr, setQtyStr] = useState(String(log.quantity));

  return (
    <div className="rounded-lg border border-hairline p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                className="h-8 w-24"
                autoFocus
              />
              <span className="text-xs text-muted-foreground">{unit}</span>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  onSave(parseFloat(qtyStr) || 0);
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="text-sm font-bold text-foreground">
              {log.quantity} {unit}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(`${log.logged_at}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {log.logged_by ? ` · ${log.logged_by}` : ""}
          </p>
          {log.note && <p className="mt-1 text-xs text-foreground/80">{log.note}</p>}
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-muted-subtle hover:text-primary" aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="text-muted-subtle hover:text-destructive" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this usage entry?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The line's Used total drops by {log.quantity} {unit}. The deletion itself stays in this line's history.
                  </AlertDialogDescription>
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
        )}
      </div>
    </div>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const UsageLogHistoryDialog = withErrorBoundary(UsageLogHistoryDialogInner, "UsageLogHistoryDialog");

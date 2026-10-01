import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { pluralize } from "@/lib/utils";
import {
  archiveOpportunity,
  checkOpportunityDelete,
  deleteOpportunity,
  type Opportunity,
  type OpportunityDeleteCheck,
} from "@/lib/api";

/** "background project · 1 cost plan · 2 quotes · 3 photos" — what goes with a delete. */
function attachedSummary(c: OpportunityDeleteCheck["counts"]): string[] {
  const parts: string[] = [];
  if (c.project) parts.push("its background project");
  if (c.cost_plans) parts.push(pluralize(c.cost_plans, "cost plan"));
  if (c.quotes) parts.push(pluralize(c.quotes, "draft quote"));
  if (c.measurements) parts.push(pluralize(c.measurements, "measurement"));
  if (c.photos) parts.push(pluralize(c.photos, "photo"));
  if (c.appointments) parts.push(pluralize(c.appointments, "appointment"));
  if (c.tasks) parts.push(pluralize(c.tasks, "task"));
  return parts;
}

/** "a", "a and b", "a, b and c". */
const listOf = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/**
 * Delete (or archive) one or more opportunities. Each one is checked by the
 * DB (opportunity_delete_check, 0155): it can only be deleted — with its
 * never-Won background project and everything on it — when nothing was
 * sent / signed / paid / shown in the Client Hub. Anything else is archived
 * instead (hidden, restorable). The delete itself re-checks in SQL.
 */
export function DeleteOpportunitiesDialog({
  opportunities,
  open,
  onOpenChange,
  onDone,
}: {
  opportunities: Opportunity[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a delete/archive — e.g. navigate away, clear a selection. */
  onDone?: (result: { deleted: string[]; archived: string[] }) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const checks = useQueries({
    queries: opportunities.map((o) => ({
      queryKey: ["opportunity-delete-check", o.id],
      queryFn: () => checkOpportunityDelete(o.id),
      enabled: open,
      staleTime: 0,
    })),
  });
  const loading = checks.some((c) => c.isLoading);
  const failed = checks.find((c) => c.error)?.error as Error | undefined;
  const rows = opportunities.map((o, i) => ({ opp: o, check: checks[i]?.data }));
  const deletable = rows.filter((r) => r.check?.can_delete);
  const blocked = rows.filter((r) => r.check && !r.check.can_delete);
  const single = opportunities.length === 1 ? rows[0] : null;

  const run = useMutation({
    mutationFn: async (mode: "delete" | "archive") => {
      const deleted: string[] = [];
      const archived: string[] = [];
      for (const r of rows) {
        if (mode === "delete" && r.check?.can_delete) {
          await deleteOpportunity(r.opp.id);
          deleted.push(r.opp.id);
        } else {
          await archiveOpportunity(r.opp.id);
          archived.push(r.opp.id);
        }
      }
      return { deleted, archived };
    },
    onSuccess: (result) => {
      for (const key of [["opportunities"], ["opportunities-archived"], ["projects"], ["appointments"], ["tasks"], ["activities"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
      for (const o of opportunities) qc.invalidateQueries({ queryKey: ["opportunity", o.id] });
      const parts = [
        result.deleted.length ? `${pluralize(result.deleted.length, "opportunity", "opportunities")} deleted` : null,
        result.archived.length ? `${pluralize(result.archived.length, "opportunity", "opportunities")} archived` : null,
      ].filter(Boolean);
      toast({ title: parts.join(" · ") });
      onOpenChange(false);
      onDone?.(result);
    },
    onError: (err: Error) => toast({ title: "Couldn't finish", description: err.message, variant: "destructive" }),
  });

  const title = single ? `Delete "${single.opp.title}"?` : `Delete ${pluralize(opportunities.length, "opportunity", "opportunities")}?`;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {loading && (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking what's attached…
                </p>
              )}
              {failed && <p className="text-destructive">{failed.message}</p>}

              {!loading && !failed && single?.check && (
                <>
                  {single.check.can_delete ? (
                    <p>
                      Deleting removes the opportunity
                      {attachedSummary(single.check.counts).length > 0 && <>, plus {listOf(attachedSummary(single.check.counts))}</>}. This
                      can't be undone.
                    </p>
                  ) : (
                    <>
                      <p className="flex items-start gap-2 text-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        This one can't be deleted — archive it instead. It's hidden from the pipeline and lists and can be restored any time.
                      </p>
                      <ul className="list-disc space-y-0.5 pl-6">
                        {single.check.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}

              {!loading && !failed && !single && (
                <>
                  {deletable.length > 0 && (
                    <p>
                      <span className="font-semibold text-foreground">{pluralize(deletable.length, "opportunity", "opportunities")}</span> can be
                      deleted with everything attached (background projects, cost plans, draft quotes, measurements, photos, appointments, tasks).
                    </p>
                  )}
                  {blocked.length > 0 && (
                    <div>
                      <p className="flex items-start gap-2 text-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        {pluralize(blocked.length, "opportunity", "opportunities")} will be archived instead (sent, signed, paid or Won):
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-6">
                        {blocked.map((r) => (
                          <li key={r.opp.id}>
                            {r.opp.title} — {r.check!.blockers[0]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={run.isPending}>Cancel</AlertDialogCancel>
          <Button variant="outline" disabled={loading || !!failed || run.isPending} onClick={() => run.mutate("archive")}>
            <Archive className="mr-2 h-4 w-4" />
            {opportunities.length === 1 ? "Archive" : "Archive all"}
          </Button>
          {deletable.length > 0 && (
            <Button variant="destructive" disabled={loading || run.isPending} onClick={() => run.mutate("delete")}>
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {single ? "Delete everything" : blocked.length > 0 ? `Delete ${deletable.length}, archive ${blocked.length}` : `Delete ${deletable.length}`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

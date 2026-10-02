import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Lock, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceMark } from "@/components/common/ChoiceMark";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  createSelectionChangeOrder,
  listProjectSelections,
  updateSelectionChangeRequest,
  type SelectionChangeRequest,
} from "@/lib/api";
import { priceLabel } from "@/lib/selections";

type Group = Awaited<ReturnType<typeof listProjectSelections>>["groups"][number];

const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The project's approved client selections (0115), per quote section /
 * feature: the choice, locked with "Approved on …", its history (Original
 * → CO #1 → Current), and any "Request a change" from the client. Changes
 * only go through a change order — even a same-price swap is a $0 one.
 */
export function ProjectSelectionsCard({ projectId }: { projectId: string }) {
  const { data } = useQuery({ queryKey: ["project-selections", projectId], queryFn: () => listProjectSelections(projectId) });
  const [changing, setChanging] = useState<{ group: Group; request?: SelectionChangeRequest } | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const closeReq = useMutation({
    mutationFn: (id: string) => updateSelectionChangeRequest(id, { status: "closed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-selections", projectId] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const approved = (data?.groups ?? []).filter((g) => g.quote.status === "approved" && g.approved_at);
  const pending = (data?.groups ?? []).filter((g) => g.quote.status === "sent");
  if (!approved.length && !pending.length) return null;
  const openRequests = (data?.requests ?? []).filter((r) => r.status === "open");

  return (
    <section className="card-surface space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Client selections</h3>
        {openRequests.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning-strong">
            <MessageSquareWarning className="h-3.5 w-3.5" />
            {openRequests.length} change request{openRequests.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {pending.length} selection{pending.length === 1 ? "" : "s"} waiting on the client's quote approval.
        </p>
      )}

      <ul className="space-y-2">
        {approved.map((g) => {
          const picked = (g.quote_selection_options ?? []).filter((o) => (g.quote_selection_picks ?? []).some((p) => p.option_id === o.id));
          const history = (data?.history ?? []).filter((h) => h.group_id === g.id);
          const reqs = openRequests.filter((r) => r.group_id === g.id);
          return (
            <li key={g.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{g.section.name}</div>
                  <div className="text-sm font-bold text-foreground">
                    {g.name}: <span className="font-semibold">{picked.map((o) => o.name).join(", ") || "—"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Approved on {dateText(g.approved_at!)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setChanging({ group: g })}>
                  <GitBranch className="mr-1 h-3.5 w-3.5" />
                  Create change order
                </Button>
              </div>
              {history.length > 1 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {history
                    .map((h, i) => `${h.source === "original" ? "Original" : `CO`}: ${h.option_names.join(", ")}${i === history.length - 1 ? " (current)" : ""}`)
                    .join(" → ")}
                </p>
              )}
              {reqs.map((r) => {
                const wanted = (g.quote_selection_options ?? []).find((o) => o.id === r.requested_option_id);
                return (
                  <div key={r.id} className="mt-2 rounded-lg bg-warning/10 p-2 text-xs">
                    <p className="font-semibold text-foreground">
                      Client asked to change{wanted ? ` to ${wanted.name}` : ""} · {dateText(r.created_at)}
                    </p>
                    {r.note && <p className="text-muted-foreground">"{r.note}"</p>}
                    <div className="mt-1.5 flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => setChanging({ group: g, request: r })}>
                        Create change order
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => closeReq.mutate(r.id)}>
                        Close request
                      </Button>
                    </div>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>

      {changing && <SelectionChangeDialog projectId={projectId} group={changing.group} request={changing.request} onClose={() => setChanging(null)} />}
    </section>
  );
}

function SelectionChangeDialog({
  projectId,
  group,
  request,
  onClose,
}: {
  projectId: string;
  group: Group;
  request?: SelectionChangeRequest;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const current = (group.quote_selection_picks ?? []).map((p) => p.option_id);
  const [to, setTo] = useState<string[]>(request?.requested_option_id ? [request.requested_option_id] : []);
  const options = group.quote_selection_options ?? [];
  const priceOf = (ids: string[]) => options.filter((o) => ids.includes(o.id)).reduce((s, o) => s + Number(o.price_delta), 0);
  const costOf = (ids: string[]) => options.filter((o) => ids.includes(o.id)).reduce((s, o) => s + Number(o.cost_delta), 0);
  const priceDiff = priceOf(to) - priceOf(current);
  const costDiff = costOf(to) - costOf(current);
  const same = to.length === current.length && to.every((x) => current.includes(x));

  const create = useMutation({
    mutationFn: () => createSelectionChangeOrder({ projectId, group, toOptionIds: to, requestId: request?.id ?? null }),
    onSuccess: (co) => {
      qc.invalidateQueries({ queryKey: ["project-selections", projectId] });
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      toast({ title: "Change order drafted", description: "Review it and send it to the client for approval." });
      onClose();
      navigate(`/projects/${projectId}/change-orders/${co.id}`);
    },
    onError: (err: Error) => toast({ title: "Couldn't create the change order", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change "{group.name}"</DialogTitle>
          <DialogDescription>Creates a draft change order on this feature — the selection only changes once the client approves it.</DialogDescription>
        </DialogHeader>
        <p className="-mb-2 text-xs text-muted-foreground">{group.multi ? "Select all that apply" : "Pick one"}</p>
        <div className="grid gap-1.5" role={group.multi ? "group" : "radiogroup"} aria-label={group.name}>
          {options.map((o) => {
            const on = to.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={group.multi ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => setTo(group.multi ? (on ? to.filter((x) => x !== o.id) : [...to, o.id]) : [o.id])}
                className={cn("flex min-h-11 items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm", on ? "border-primary bg-primary/5" : "border-border")}
              >
                <ChoiceMark multi={group.multi} checked={on} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{o.name}</span>
                  {current.includes(o.id) && <span className="ml-1.5 text-[11px] text-muted-subtle">current</span>}
                </span>
                <span className="text-xs text-muted-foreground">{priceLabel(Number(o.price_delta))}</span>
              </button>
            );
          })}
        </div>
        {!same && to.length > 0 && (
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Price change (client)</span>
              <span className="font-semibold">{priceDiff === 0 ? "$0 — recorded as a $0 change order" : `${priceDiff > 0 ? "+" : "−"}${formatCurrency(Math.abs(priceDiff))}`}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Cost change (internal)</span>
              <span className="font-semibold">
                {costDiff > 0 ? "+" : costDiff < 0 ? "−" : ""}
                {formatCurrency(Math.abs(costDiff))}
              </span>
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={same || !to.length || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create change order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

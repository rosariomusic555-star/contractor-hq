import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardCheck, MinusCircle, MoreHorizontal, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { addProjectPreconItem, createStartConfirmation, getProject, updatePreconItem } from "@/lib/api";
import { preconPhase, type ItemView, type PreconAction } from "@/lib/precon";
import { useHeadsUp } from "@/components/schedule/rainDelayContext";
import { usePreconBundle } from "./usePrecon";
import { READINESS_LABEL, READINESS_TONE } from "./preconStyles";
import { PreconItemSheet } from "./PreconItemSheet";

const ACTION_LABEL: Record<PreconAction, string> = {
  open_quote: "Open quotes",
  open_selections: "Open quote",
  record_payment: "Record payment",
  open_cost_plan: "Open cost plan",
  assign_crew: "Assign crew",
  send_start_confirmation: "Send start confirmation",
  edit: "Edit",
};

/**
 * Pre-construction card (0124), near the top of the project page from Won
 * until the job starts: "5 of 8 ready", Ready / Items open / Blocked, each
 * item with its status and a quick action; tap a row to edit it. After the
 * start it collapses to "Started with 1 open item" (hidden if all done).
 * Internal only — never in the Client Hub.
 */
export function PreconCard({ projectId, onRecordPayment, onAssignCrew }: { projectId: string; onRecordPayment: () => void; onAssignCrew: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const openHeadsUp = useHeadsUp();
  const { data: b } = usePreconBundle(projectId);
  const [editing, setEditing] = useState<ItemView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  // "Edit this job's checklist": a local draft (rename / reorder / remove), saved together.
  const [listDraft, setListDraft] = useState<{ id: string; label: string; removed: boolean }[] | null>(null);

  const add = useMutation({
    mutationFn: () => addProjectPreconItem(projectId, newLabel, true),
    onSuccess: () => {
      setNewLabel("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["precon", projectId] });
    },
    onError: (err: Error) => toast({ title: "Couldn't add", description: err.message, variant: "destructive" }),
  });

  // Confirmed with the client outside the app (a call, on site) — no message sent.
  const markConfirmed = useMutation({
    mutationFn: (itemId: string) => updatePreconItem(itemId, { override: true, status: "done", note: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["precon", projectId] });
      toast({ title: "Start date marked as confirmed" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  const saveList = useMutation({
    mutationFn: async (draft: { id: string; label: string; removed: boolean }[]) => {
      const byId = new Map(b!.readiness.views.map((v) => [v.item.id, v.item]));
      let i = 0;
      for (const d of draft) {
        const it = byId.get(d.id);
        if (!it) continue;
        if (d.removed) {
          await updatePreconItem(d.id, { removed: true });
          continue;
        }
        const order = ++i * 10;
        const label = d.label.trim() || it.label;
        if (label !== it.label || order !== it.sort_order) await updatePreconItem(d.id, { label, sort_order: order });
      }
    },
    onSuccess: () => {
      setListDraft(null);
      qc.invalidateQueries({ queryKey: ["precon", projectId] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save the checklist", description: err.message, variant: "destructive" }),
  });

  if (!b) return null;
  const phase = preconPhase(b.project);
  const r = b.readiness;
  if (phase === "hidden" || r.views.length === 0) return null;
  if (phase === "started" && r.openRequired.length === 0 && r.views.every((v) => v.state !== "open")) return null;

  const act = async (v: ItemView) => {
    switch (v.action) {
      case "open_quote":
        return navigate(`/projects/${projectId}/quotes`);
      case "open_selections":
        return navigate(b.headlineQuoteId ? `/projects/${projectId}/quotes/${b.headlineQuoteId}` : `/projects/${projectId}/quotes`);
      case "record_payment":
        return onRecordPayment();
      case "open_cost_plan":
        return navigate(`/projects/${projectId}/materials`);
      case "assign_crew":
        return onAssignCrew();
      case "send_start_confirmation":
        try {
          const project = await getProject(projectId);
          if (!project.client_id) return toast({ title: "This job has no client" });
          const u = await createStartConfirmation(project);
          openHeadsUp?.({ ids: [u.id] });
        } catch (err) {
          toast({ title: "Couldn't start that", description: (err as Error).message, variant: "destructive" });
        }
        return;
      default:
        setEditing(v);
    }
  };

  const locate = r.views.find((v) => v.item.kind === "locate" && v.state !== "na");
  const ticket = locate ? String(locate.item.details.ticket ?? "") : "";
  const collapsed = phase === "started" && !expanded;
  const openCount = r.views.filter((v) => v.state === "open").length;

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" /> Pre-construction
        </h3>
        <div className="flex items-center gap-1">
          {phase === "before" && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", READINESS_TONE[r.status])}>
              {r.status === "open" ? `${r.openRequired.length} item${r.openRequired.length === 1 ? "" : "s"} open` : READINESS_LABEL[r.status]}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Checklist options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setListDraft(r.views.map((v) => ({ id: v.item.id, label: v.item.label, removed: false })))}>
                Edit this job's checklist
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/settings/precon")}>Edit default checklist</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {phase === "started" ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 flex items-center gap-1 text-sm font-semibold text-warning">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Started with {openCount} open item{openCount === 1 ? "" : "s"}
        </button>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.done} of {r.total} ready
            {r.daysToStart != null && r.daysToStart >= 0 && ` · starts in ${r.daysToStart} day${r.daysToStart === 1 ? "" : "s"}`}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", r.status === "blocked" ? "bg-destructive" : "bg-primary")} style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
          </div>
        </>
      )}

      {/* 811 — the crew needs the ticket # and expiry on site. */}
      {!collapsed && locate && ticket && (
        <div className={cn("mt-3 rounded-xl border p-3", locate.warnings.length ? "border-warning-strong/50 bg-warning-strong/10" : "border-border bg-muted/40")}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">811 ticket</p>
          <p className="text-lg font-extrabold tracking-wide text-foreground">#{ticket}</p>
          <p className="text-sm text-muted-foreground">{locate.detail.replace(/^#\S+ · /, "")}</p>
        </div>
      )}

      {listDraft && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Only this job — the default list for new jobs is in Settings › Pre-construction.
          </p>
          <ul className="space-y-1.5">
            {listDraft
              .filter((d) => !d.removed)
              .map((d, i, visible) => {
                const move = (dir: -1 | 1) =>
                  setListDraft((cur) => {
                    if (!cur) return cur;
                    const other = visible[i + dir];
                    if (!other) return cur;
                    const next = [...cur];
                    const a = next.findIndex((x) => x.id === d.id);
                    const bIdx = next.findIndex((x) => x.id === other.id);
                    [next[a], next[bIdx]] = [next[bIdx], next[a]];
                    return next;
                  });
                return (
                  <li key={d.id} className="flex items-center gap-1">
                    <Input
                      value={d.label}
                      aria-label={`Rename ${d.label}`}
                      onChange={(e) => setListDraft((cur) => cur && cur.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                      className="h-10 min-w-0 flex-1"
                    />
                    <Button size="icon" variant="ghost" className="h-10 w-9" aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-10 w-9" aria-label="Move down" disabled={i === visible.length - 1} onClick={() => move(1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-9 text-destructive"
                      aria-label={`Remove ${d.label} from this job`}
                      onClick={() => setListDraft((cur) => cur && cur.map((x) => (x.id === d.id ? { ...x, removed: true } : x)))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setListDraft(null)} disabled={saveList.isPending}>
              Cancel
            </Button>
            <Button size="sm" className="font-bold" onClick={() => saveList.mutate(listDraft)} disabled={saveList.isPending}>
              {saveList.isPending ? "Saving…" : "Save checklist"}
            </Button>
          </div>
        </div>
      )}

      {!collapsed && !listDraft && (
        <ul className="mt-3 divide-y divide-hairline">
          {r.views.map((v) => {
            const Icon = v.state === "done" ? CheckCircle2 : v.state === "na" ? MinusCircle : v.warnings.length ? AlertTriangle : Circle;
            const tone =
              v.state === "done" ? "text-success" : v.state === "na" ? "text-muted-subtle" : v.item.required ? (r.status === "blocked" ? "text-destructive" : "text-warning") : "text-muted-foreground";
            return (
              <li key={v.item.id} className="flex items-start gap-2 py-1">
                <button type="button" onClick={() => setEditing(v)} className="flex min-h-[48px] min-w-0 flex-1 items-start gap-2.5 rounded-lg py-1.5 text-left hover:bg-muted/40">
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone)} />
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", v.state === "na" ? "text-muted-foreground line-through" : "text-foreground")}>
                      {v.item.label}
                      {!v.item.required && <span className="ml-1.5 text-[11px] font-normal text-muted-subtle">optional</span>}
                    </span>
                    {v.detail && <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{v.detail}</span>}
                    {v.warnings.map((w) => (
                      <span key={w} className="block text-xs font-semibold text-warning">
                        {w}
                      </span>
                    ))}
                  </span>
                </button>
                {v.state === "open" && v.action && v.action !== "edit" && (
                  <Button size="sm" variant="outline" className="mt-2 h-9 shrink-0 px-2.5 text-xs" onClick={() => void act(v)}>
                    {ACTION_LABEL[v.action]}
                  </Button>
                )}
                {v.state === "open" && v.item.kind === "start_confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-9 shrink-0 px-2.5 text-xs"
                    disabled={markConfirmed.isPending}
                    title="You confirmed it with the client yourself — nothing is sent"
                    onClick={() => markConfirmed.mutate(v.item.id)}
                  >
                    Mark confirmed
                  </Button>
                )}
                {v.state === "open" && v.item.kind === "locate" && !ticket && (
                  <Button size="sm" variant="outline" className="mt-2 h-9 shrink-0 px-2.5 text-xs" onClick={() => setEditing(v)}>
                    Add 811 ticket
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!collapsed &&
        !listDraft &&
        (adding ? (
          <div className="mt-2 flex gap-2">
            <Input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Dumpster ordered" className="h-10" />
            <Button className="h-10" disabled={!newLabel.trim() || add.isPending} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-1 h-9 text-xs" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item for this job
          </Button>
        ))}

      <PreconItemSheet view={editing} projectId={projectId} settings={b.settings} onOpenChange={(o) => !o && setEditing(null)} />
    </section>
  );
}

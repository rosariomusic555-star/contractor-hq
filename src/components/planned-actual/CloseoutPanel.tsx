import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePlannedActual } from "@/hooks/use-planned-actual";
import { cn, formatCurrency } from "@/lib/utils";
import { createCloseout, updateCloseout } from "@/lib/api";
import { unitHighlights, type Closeout } from "@/lib/closeout";
import { contextPhrase } from "@/lib/jobContext";
import { signedMoney, VARIANCE_TONE_CLASS, varianceTone } from "@/lib/plannedActual";

/**
 * Closeout (0114): a frozen planned-vs-actual summary of a completed job —
 * by feature and cost type, labor, profit impact, job context and per-unit
 * actuals. Later edits to the project never change it; "Re-run closeout"
 * makes a new one and keeps the old one (superseded). The contractor adds a
 * "What happened" note and can exclude an unusual job from comparisons.
 */
export function CloseoutPanel({ projectId }: { projectId: string }) {
  const data = usePlannedActual(projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
  if (!data) return null;
  const c = data.current;
  return (
    <div className="border-t border-hairline pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Closeout summary</div>
        {c && (
          <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-run closeout
          </Button>
        )}
      </div>
      {c ? (
        <CloseoutSummary closeout={c} supersededCount={data.closeouts.length - 1} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">Close out this job to lock in how it went and use it to improve future estimates.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Create closeout
          </Button>
        </div>
      )}
      <CloseoutDialog projectId={projectId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

export function CloseoutSummary({ closeout, supersededCount = 0 }: { closeout: Closeout; supersededCount?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState(closeout.what_happened ?? "");
  useEffect(() => setNote(closeout.what_happened ?? ""), [closeout.id, closeout.what_happened]);
  const save = useMutation({
    mutationFn: (patch: { what_happened?: string | null; excluded?: boolean }) => updateCloseout(closeout.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts"] });
      qc.invalidateQueries({ queryKey: ["all-closeouts"] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const r = closeout.snapshot.report;
  const loaded = r.profit.actualFullyLoaded != null && r.profit.expectedFullyLoaded != null;
  const exp = loaded ? r.profit.expectedFullyLoaded! : r.profit.expected;
  const act = loaded ? r.profit.actualFullyLoaded! : r.profit.actual;
  const ctx = contextPhrase(closeout.context);

  return (
    <div className={cn("space-y-3 rounded-xl border border-border p-3", closeout.excluded && "opacity-80")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Closed out {new Date(closeout.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {supersededCount > 0 && ` · replaces ${supersededCount} earlier closeout${supersededCount === 1 ? "" : "s"}`}
        </span>
        {!closeout.snapshot.materials_reconciled && <span className="text-warning-strong">{closeout.snapshot.unreconciled_lines} material line{closeout.snapshot.unreconciled_lines === 1 ? " wasn't" : "s weren't"} reconciled</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Planned cost" value={formatCurrency(r.project.total.planned)} />
        <Stat label="Actual cost" value={formatCurrency(r.project.total.actual)} tone={VARIANCE_TONE_CLASS[r.project.total.tone]} />
        <Stat label={`Expected ${loaded ? "(loaded)" : "profit"}`} value={formatCurrency(exp)} />
        <Stat label={`Actual ${loaded ? "(loaded)" : "profit"}`} value={`${formatCurrency(act)}`} sub={signedMoney(act - exp)} tone={act - exp < 0 ? "text-destructive" : "text-success"} />
      </div>
      {closeout.snapshot.schedule && (closeout.snapshot.schedule.actual_working_days != null || closeout.snapshot.schedule.weather_delay_days > 0) && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Duration:</span>{" "}
          {[
            closeout.snapshot.schedule.actual_working_days != null ? `${closeout.snapshot.schedule.actual_working_days} working days` : null,
            closeout.snapshot.schedule.estimated_days != null ? `estimated ${closeout.snapshot.schedule.estimated_days}` : null,
            closeout.snapshot.schedule.weather_delay_days > 0 ? `+${closeout.snapshot.schedule.weather_delay_days} weather (not counted against the estimate)` : null,
            closeout.snapshot.schedule.other_delay_days > 0 ? `${closeout.snapshot.schedule.other_delay_days} other delay days` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {(ctx || closeout.context.crew_size) && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Context:</span> {[ctx, closeout.context.crew_size ? `crew of ${closeout.context.crew_size}` : null].filter(Boolean).join(", ")}
        </p>
      )}
      <ul className="space-y-2">
        {closeout.features.map((f) => {
          const hl = unitHighlights(f);
          const tone = varianceTone(f.planned.total, f.actual.total);
          return (
            <li key={f.feature_id ?? "general"} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {f.name}
                  {f.size ? <span className="ml-1 font-normal text-muted-foreground">· {f.size.toLocaleString()} {f.size_unit}</span> : null}
                </span>
                <span className={cn("font-bold tabular-nums", VARIANCE_TONE_CLASS[tone])}>
                  {formatCurrency(f.planned.total)} → {formatCurrency(f.actual.total)}
                </span>
              </div>
              {hl.length > 0 && <div className="mt-0.5 text-muted-foreground">{hl.join(" · ")}</div>}
              {(f.base_depth_in || f.material_system) && (
                <div className="text-muted-subtle">{[f.base_depth_in ? `${f.base_depth_in}" base` : null, f.material_system].filter(Boolean).join(" · ")}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor={`what-${closeout.id}`} className="text-xs">What happened</Label>
        <Textarea
          id={`what-${closeout.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (closeout.what_happened ?? "") && save.mutate({ what_happened: note })}
          placeholder="e.g. hit roots, extra excavation"
        />
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox checked={closeout.excluded} onCheckedChange={(v) => save.mutate({ excluded: !!v })} className="mt-0.5" />
        <span>
          <span className="font-semibold text-foreground">Exclude from comparisons</span>
          <span className="block text-xs text-muted-foreground">An unusual job — keep it out of similar-job averages and estimating insights.</span>
        </span>
      </label>
      <Link to="/settings/estimating-insights" className="inline-block text-xs font-semibold text-primary hover:underline">
        Estimating insights →
      </Link>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-extrabold tabular-nums text-foreground", tone)}>{value}</div>
      {sub && <div className={cn("text-[11px] font-bold tabular-nums", tone)}>{sub}</div>}
    </div>
  );
}

/** Create (or re-run) the closeout — opened automatically when a project
 * is marked Complete, and from the Closeout summary. */
export function CloseoutDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = usePlannedActual(projectId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [excluded, setExcluded] = useState(false);
  useEffect(() => {
    if (open) {
      setNote(data?.current?.what_happened ?? "");
      setExcluded(data?.current?.excluded ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const create = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Still loading");
      const built = data.buildCloseout();
      await createCloseout({ project_id: projectId, ...built, what_happened: note, excluded });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts"] });
      qc.invalidateQueries({ queryKey: ["all-closeouts"] });
      toast({ title: "Closeout saved", description: "It's locked in — later edits to the project won't change it." });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Couldn't save the closeout", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{data?.current ? "Re-run closeout" : "Close out this job"}</DialogTitle>
          <DialogDescription>
            Snapshots planned vs actual by feature, labor, profit and job context. {data?.current ? "The earlier closeout is kept, marked as replaced." : ""}
          </DialogDescription>
        </DialogHeader>
        {data && data.unreconciled > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
            <span>
              {data.unreconciled} material line{data.unreconciled === 1 ? " isn't" : "s aren't"} reconciled yet. Delivered cost still counts, but returns and leftovers
              won't be credited — reconcile first on the Cost plan for the most accurate result.
            </span>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="closeout-note">What happened (optional)</Label>
          <Textarea id="closeout-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. hit roots, extra excavation" />
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox checked={excluded} onCheckedChange={(v) => setExcluded(!!v)} className="mt-0.5" />
          <span>
            <span className="font-semibold">Exclude from comparisons</span>
            <span className="block text-xs text-muted-foreground">For an unusual job you don't want in averages or insights.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={() => create.mutate()} disabled={!data || create.isPending}>
            {create.isPending ? "Saving…" : "Save closeout"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

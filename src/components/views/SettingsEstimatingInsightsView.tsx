import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, ChevronDown, Clock, Lightbulb, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  applyRecommendation,
  getVarianceThresholds,
  listCloseouts,
  listEstimatingAdjustments,
  listEstimatingChanges,
  listProjects,
  listRecommendationStates,
  listSmartSectionSettings,
  saveVarianceThresholds,
  setEstimatingAdjustmentActive,
  setRecommendationState,
  undoEstimatingChange,
} from "@/lib/api";
import { computeRecommendations, openRecommendations, MIN_JOBS, MIN_SAME_DIRECTION, roundHalf, TRIGGER, type Recommendation } from "@/lib/estimatingInsights";
import { usableCloseouts } from "@/lib/similarJobs";
import { findSmartSectionTemplate } from "@/lib/smartSections";
import { projectHref } from "@/lib/projectTabs";


const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Settings › Estimating insights (Feature 5). Suggested changes from
 * patterns in completed jobs — never applied automatically. Apply / Apply
 * to this condition only / Dismiss / Remind me later, with the evidence;
 * a history of applied changes with undo; the adjustments in effect; and
 * the variance color thresholds.
 */
export function SettingsEstimatingInsightsView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: closeouts = [] } = useQuery({ queryKey: ["all-closeouts"], queryFn: listCloseouts });
  const { data: states = [] } = useQuery({ queryKey: ["recommendation-states"], queryFn: listRecommendationStates });
  const { data: adjustments = [] } = useQuery({ queryKey: ["estimating-adjustments"], queryFn: listEstimatingAdjustments });
  const { data: changes = [] } = useQuery({ queryKey: ["estimating-changes"], queryFn: listEstimatingChanges });
  const { data: smartSettings = [] } = useQuery({ queryKey: ["smart-section-settings"], queryFn: listSmartSectionSettings });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  const recs = useMemo(() => computeRecommendations(closeouts), [closeouts]);
  const open = openRecommendations(recs, states);
  const usable = usableCloseouts(closeouts);
  const excludedCount = closeouts.filter((c) => !c.superseded_at && c.excluded).length;
  const closedIds = new Set(closeouts.map((c) => c.project_id));
  const needCloseout = projects.filter((p) => p.status === "complete" && !closedIds.has(p.id));

  const invalidate = () => {
    for (const k of ["recommendation-states", "estimating-adjustments", "estimating-changes", "smart-section-settings"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const currentFor = (bt: string) => {
    const s = smartSettings.find((x) => x.build_type === bt);
    const template = findSmartSectionTemplate(bt);
    const coverageDefault = Number(template?.tunables.find((t) => t.key === "base_coverage_sqft_per_ton")?.defaultValue ?? 165);
    return { tunables: s?.tunables ?? {}, laborDefault: s?.labor_default ?? null, baseCoverageDefault: coverageDefault };
  };

  const apply = useMutation({
    mutationFn: ({ rec, mode }: { rec: Recommendation; mode: "default" | "condition" }) => applyRecommendation(rec, mode, currentFor(rec.build_type)),
    onSuccess: (summary) => {
      invalidate();
      toast({ title: "Applied", description: `${summary}. You can undo it below.` });
    },
    onError: (err: Error) => toast({ title: "Couldn't apply", description: err.message, variant: "destructive" }),
  });
  const setState = useMutation({
    mutationFn: ({ rec, status }: { rec: Recommendation; status: "dismissed" | "snoozed" }) =>
      setRecommendationState(rec.key, status, {
        snooze_until: status === "snoozed" ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
        evidence: { median: rec.median, jobs: rec.evidence.length },
      }),
    onSuccess: (_d, v) => {
      invalidate();
      toast({ title: v.status === "dismissed" ? "Dismissed" : "We'll remind you in 30 days" });
    },
  });
  const undo = useMutation({
    mutationFn: undoEstimatingChange,
    onSuccess: () => {
      invalidate();
      toast({ title: "Undone", description: "Restored the previous value." });
    },
    onError: (err: Error) => toast({ title: "Couldn't undo", description: err.message, variant: "destructive" }),
  });
  const toggleAdj = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setEstimatingAdjustmentActive(id, active),
    onSuccess: invalidate,
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Estimating insights" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Estimating insights</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Suggestions from how your completed jobs actually went against their plans. Nothing changes unless you tap Apply — and every change
        can be undone. Internal only.
      </p>

      <section className="card-surface space-y-2 p-5">
        <h3 className="text-base font-bold text-foreground">Based on</h3>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{usable.length}</span> closed-out job{usable.length === 1 ? "" : "s"}
          {excludedCount > 0 && `, ${excludedCount} excluded as unusual`}. A suggestion needs at least {MIN_JOBS} jobs with the same
          pattern, {MIN_SAME_DIRECTION}+ of them off by more than {Math.round(TRIGGER * 100)}% in the same direction.
        </p>
        {needCloseout.length > 0 && (
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <p className="font-semibold text-foreground">
              {needCloseout.length} completed job{needCloseout.length === 1 ? "" : "s"} without a closeout
            </p>
            <p className="text-xs text-muted-foreground">Open one and tap "Create closeout" in Planned vs actual to add it to your insights.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {needCloseout.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <Link to={projectHref(p.id, "money")} className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-foreground">Suggestions</h3>
        {open.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">No suggestions right now — your plans are tracking your actuals, or there aren't enough similar jobs yet.</p>
        ) : (
          open.map((rec) => (
            <RecommendationCard
              key={rec.key}
              rec={rec}
              current={currentFor(rec.build_type)}
              busy={apply.isPending || setState.isPending}
              onApply={(mode) => apply.mutate({ rec, mode })}
              onDismiss={() => setState.mutate({ rec, status: "dismissed" })}
              onSnooze={() => setState.mutate({ rec, status: "snoozed" })}
            />
          ))
        )}
      </section>

      <section className="card-surface space-y-2 p-5">
        <h3 className="text-base font-bold text-foreground">Adjustments in effect</h3>
        <p className="text-xs text-muted-foreground">
          Used by the Smart Section calculator (shown there, with an opt-out per job) and offered on labor blocks — only on jobs matching their condition.
        </p>
        {adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className={cn("min-w-0 text-sm", !a.active && "text-muted-foreground line-through")}>
                  <span className="font-semibold">{a.label}</span> <span className="text-xs text-muted-foreground">×{n2(Number(a.factor))}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleAdj.mutate({ id: a.id, active: !a.active })}>
                  {a.active ? "Turn off" : "Turn on"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface space-y-2 p-5">
        <h3 className="text-base font-bold text-foreground">Applied changes</h3>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing applied yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className={cn("text-sm font-semibold text-foreground", c.undone_at && "text-muted-foreground line-through")}>{c.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(c.applied_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {c.undone_at && ` · undone ${new Date(c.undone_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </div>
                </div>
                {!c.undone_at && (
                  <Button size="sm" variant="outline" disabled={undo.isPending} onClick={() => undo.mutate(c)}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <VarianceThresholdsCard />
    </div>
  );
}

function RecommendationCard({
  rec,
  current,
  busy,
  onApply,
  onDismiss,
  onSnooze,
}: {
  rec: Recommendation;
  current: { tunables: Record<string, number>; laborDefault: { crew_size: number | null; days: number | null } | null; baseCoverageDefault: number };
  busy: boolean;
  onApply: (mode: "default" | "condition") => void;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((rec.median - 1) * 100);
  let applyText: string;
  if (rec.kind === "base") {
    const before = current.tunables.base_coverage_sqft_per_ton ?? current.baseCoverageDefault;
    applyText = `Change base coverage ${n2(before)} → ${n2(Math.round((before / rec.median) * 10) / 10)} sq ft/ton for every ${rec.buildTypeLabel.toLowerCase()}`;
  } else if (current.laborDefault?.days) {
    applyText = `Change default labor ${n2(current.laborDefault.days)} → ${n2(roundHalf(current.laborDefault.days * rec.median))} days`;
  } else {
    applyText = `Add ${pct >= 0 ? "+" : ""}${pct}% labor for every ${rec.buildTypeLabel.toLowerCase()}`;
  }
  return (
    <div className="card-surface space-y-3 p-4">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{rec.headline}</p>
          <p className="text-xs text-muted-foreground">
            Median {n2(rec.median)}× plan · {rec.overCount} over, {rec.underCount} under
          </p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs font-semibold text-primary">
        {open ? "Hide" : "See"} the {rec.evidence.length} jobs
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-hairline rounded-xl border border-border text-xs">
          {rec.evidence.map((e) => (
            <li key={`${e.project_id}-${e.feature}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <Link to={`/projects/${e.project_id}`} className="min-w-0 truncate font-semibold text-primary hover:underline">
                {e.project_name}
              </Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {n2(e.planned)} → {n2(e.actual)} {rec.kind === "base" ? "tons" : "man-hours"} ·{" "}
                <span className={cn("font-bold", e.ratio > 1 + TRIGGER ? "text-destructive" : e.ratio < 1 - TRIGGER ? "text-success" : "text-foreground")}>{n2(e.ratio)}×</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onApply("default")} title={applyText}>
          <Check className="mr-1 h-3.5 w-3.5" />
          Apply
        </Button>
        {rec.condition && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onApply("condition")}>
            Apply to {rec.conditionLabel} only
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onSnooze}>
          <Clock className="mr-1 h-3.5 w-3.5" />
          Remind me later
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
          <X className="mr-1 h-3.5 w-3.5" />
          Dismiss
        </Button>
      </div>
      <p className="text-[11px] text-muted-subtle">
        Apply: {applyText}.{rec.condition ? ` Condition only: a ×${n2(rec.median)} adjustment used only on jobs with ${rec.conditionLabel}.` : ""}
      </p>
    </div>
  );
}

function VarianceThresholdsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["variance-thresholds"], queryFn: getVarianceThresholds });
  const [amber, setAmber] = useState("");
  const [red, setRed] = useState("");
  useEffect(() => {
    if (data) {
      setAmber(String(data.variance_amber_pct));
      setRed(String(data.variance_red_pct));
    }
  }, [data]);
  const a = Number(amber);
  const r = Number(red);
  const valid = amber !== "" && red !== "" && isFinite(a) && isFinite(r) && a >= 0 && r > a;
  const dirty = !!data && (a !== data.variance_amber_pct || r !== data.variance_red_pct);
  const save = useMutation({
    mutationFn: () => saveVarianceThresholds({ variance_amber_pct: a, variance_red_pct: r }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variance-thresholds"] });
      toast({ title: "Variance colors saved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  return (
    <section className="card-surface space-y-3 p-5">
      <div className="flex items-center gap-2">
        <BellOff className="h-4 w-4 text-muted-subtle" />
        <h3 className="text-base font-bold text-foreground">Variance colors</h3>
      </div>
      <p className="text-xs text-muted-foreground">How planned vs actual is colored on the project page, the Cost plan and closeouts.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-xs font-semibold text-muted-foreground">Green up to (% over plan)</span>
          <Input inputMode="decimal" value={amber} onChange={(e) => setAmber(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold text-muted-foreground">Red above (% over plan)</span>
          <Input inputMode="decimal" value={red} onChange={(e) => setRed(e.target.value)} className="mt-1" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-success">Green</span> at or under plan (up to {amber || "0"}% over) ·{" "}
        <span className="font-semibold text-warning-strong">amber</span> up to {red || "10"}% over ·{" "}
        <span className="font-semibold text-destructive">red</span> beyond.
      </p>
      {!valid && <p className="text-xs text-destructive">Red must be higher than green, and neither can be negative.</p>}
      <div className="flex justify-end">
        <Button size="sm" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </section>
  );
}

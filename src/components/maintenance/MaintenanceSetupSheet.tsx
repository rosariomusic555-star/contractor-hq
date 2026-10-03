import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createMaintenanceItems, dismissMaintenanceSetup, listFeatureWarranties, listCategories, listMaintenanceTemplates, listProjectFeatures, type Project } from "@/lib/api";
import { activeFeatures, featureBuildType, featureName } from "@/lib/features";
import { intervalLabel, proposeItems, warrantyEnd, type ProposedItem } from "@/lib/maintenance";
import { isoDate } from "@/lib/weatherRisk";
import { useMaintenanceItems, useMaintenanceSettings } from "./useMaintenance";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

/**
 * The completion step (0127): suggested maintenance items per feature (from
 * Settings › Maintenance templates), each with its first due date — pick,
 * adjust, confirm. Warranty end dates per feature come from the warranty
 * years set per type. Nothing is written until "Save reminders".
 */
function MaintenanceSetupSheetInner({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: templates = [] } = useQuery({ queryKey: ["maintenance-templates"], queryFn: listMaintenanceTemplates, enabled: open });
  const { data: settings } = useMaintenanceSettings();
  const { data: features = [] } = useQuery({ queryKey: ["project-features", project.id], queryFn: () => listProjectFeatures(project.id), enabled: open });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories, enabled: open });
  // Opened again (Add / a second setup link): never re-offer what's set up.
  const { data: existing = [] } = useMaintenanceItems(project.id);
  const { data: existingWarranties = [] } = useQuery({ queryKey: ["feature-warranties", project.id], queryFn: () => listFeatureWarranties(project.id), enabled: open });
  const completedOn = (project.completed_at ?? project.actual_end_date ?? isoDate(new Date())).slice(0, 10);

  const live = useMemo(() => activeFeatures(features), [features]);
  const proposed = useMemo(
    () =>
      proposeItems(
        live.map((f) => ({ id: f.id, label: featureName(f, categories), category: categories.find((c) => c.id === f.category_id)?.name ?? null })),
        templates,
        completedOn,
      ).filter((p) => !existing.some((i) => i.status === "active" && i.template_id === p.template_id && i.feature_id === p.feature_id)),
    [live, categories, templates, completedOn, existing],
  );

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [warranty, setWarranty] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setPicked(Object.fromEntries(proposed.map((p) => [p.key, true])));
    setDates({});
  }, [open, proposed]);
  useEffect(() => {
    if (!open) return;
    setWarranty(
      Object.fromEntries(
        live.map((f) => {
          const saved = existingWarranties.find((w) => w.id === f.id)?.warranty_ends_on;
          if (saved) return [f.id, saved];
          const bt = featureBuildType(f, categories);
          return [f.id, warrantyEnd(completedOn, bt ? settings?.warranties?.[bt] : null) ?? ""];
        }),
      ),
    );
  }, [open, live, categories, settings, completedOn, existingWarranties]);

  const save = useMutation({
    mutationFn: async () => {
      // Warranty only → nothing to remind about; don't ask again.
      if (count === 0 && existing.length === 0) await dismissMaintenanceSetup(project.id);
      await createMaintenanceItems(
        project.id,
        proposed
          .filter((p) => picked[p.key])
          .map((p) => ({
            feature_id: p.feature_id,
            template_id: p.template_id,
            label: p.label,
            description: p.description,
            interval_months: p.interval_months,
            as_needed: p.as_needed,
            remind_month: p.remind_month,
            next_due: p.as_needed ? null : dates[p.key] || p.next_due,
          })),
        live.map((f) => ({ feature_id: f.id, ends_on: warranty[f.id] || null })),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-items"] });
      qc.invalidateQueries({ queryKey: ["project-features", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["feature-warranties", project.id] });
      toast({ title: "Maintenance reminders set" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const byFeature = new Map<string, ProposedItem[]>();
  for (const p of proposed) byFeature.set(p.feature_id ?? "", [...(byFeature.get(p.feature_id ?? "") ?? []), p]);
  const count = proposed.filter((p) => picked[p.key]).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[92vh] rounded-t-2xl" : "w-full sm:max-w-md")}>
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle>Maintenance reminders</SheetTitle>
          <SheetDescription>We'll remind you when it's time to reach out to {project.client?.name ?? "the client"}. Suggestions come from Settings › Maintenance.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-5 py-4">
          {live.length === 0 && <p className="text-sm text-muted-foreground">This job has no features yet — add them on the project first.</p>}
          {live.map((f) => {
            const items = byFeature.get(f.id) ?? [];
            return (
              <section key={f.id} className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">{featureName(f, categories)}</h3>
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {existing.some((i) => i.feature_id === f.id && i.status === "active") ? "Already set up — every suggestion for this type is on." : "No suggestions for this type."}
                  </p>
                )}
                {items.map((p) => (
                  <div key={p.key} className="rounded-xl border border-hairline p-3">
                    <label className="flex items-start gap-2">
                      <Checkbox className="mt-0.5" checked={!!picked[p.key]} onCheckedChange={(v) => setPicked((s) => ({ ...s, [p.key]: v === true }))} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{intervalLabel({ ...p, interval_months_max: templates.find((t) => t.id === p.template_id)?.interval_months_max ?? null })}</span>
                      </span>
                    </label>
                    {picked[p.key] && !p.as_needed && (
                      <label className="mt-2 flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                        First reminder
                        <Input type="date" value={dates[p.key] || p.next_due || ""} onChange={(e) => setDates((s) => ({ ...s, [p.key]: e.target.value }))} className="h-9 w-40" />
                      </label>
                    )}
                  </div>
                ))}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Warranty ends
                  <Input type="date" value={warranty[f.id] ?? ""} onChange={(e) => setWarranty((s) => ({ ...s, [f.id]: e.target.value }))} className="h-9 w-40" />
                </label>
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-hairline bg-background px-5 py-3">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" disabled={save.isPending || (count === 0 && live.length === 0)} onClick={() => save.mutate()}>
            {count ? `Save ${count} reminder${count === 1 ? "" : "s"}` : "Save warranty"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const MaintenanceSetupSheet = withErrorBoundary(MaintenanceSetupSheetInner, "MaintenanceSetupSheet");

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getProgressSettings, saveProgressSettings, type ProgressSettings } from "@/lib/api";
import { DEFAULT_MILESTONES, MILESTONE_BUILD_TYPES } from "@/lib/progress";

/** Settings › Progress updates (0126): crew approval, the "let the client
 * know" prompt, and milestone presets per feature type. */
export function SettingsProgressView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["progress-settings"], queryFn: getProgressSettings });
  const [draft, setDraft] = useState<ProgressSettings | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);
  const save = useMutation({
    mutationFn: (s: ProgressSettings) => saveProgressSettings(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress-settings"] });
      toast({ title: "Saved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  if (!draft) return <p className="text-muted-foreground">Loading…</p>;
  const milestoneText = (k: string) => (draft.milestones[k] ?? DEFAULT_MILESTONES[k] ?? []).join("\n");

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Progress updates" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Progress updates</h1>
      </div>
      <section className="card-surface space-y-4 p-5 md:p-6">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-bold text-foreground">Crew updates need approval before sharing</span>
            <span className="block text-xs text-muted-foreground">Crew posts marked "share" wait in Updates to review</span>
          </span>
          <Switch checked={draft.crew_needs_approval} onCheckedChange={(v) => setDraft({ ...draft, crew_needs_approval: v })} />
        </label>
        <div>
          <p className="text-sm font-bold text-foreground">Offer to text the client after sharing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ["each", "After every shared update"],
              ["daily", "At most once a day"],
              ["never", "Never"],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setDraft({ ...draft, notify_mode: v })}
                className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", draft.notify_mode === v ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Milestones</h2>
        <p className="text-xs text-muted-foreground">One per line, in order. Shown as the client's progress tracker.</p>
        {MILESTONE_BUILD_TYPES.map((b) => (
          <label key={b.key} className="block">
            <span className="text-xs font-semibold text-muted-foreground">{b.label}</span>
            <Textarea
              rows={4}
              defaultValue={milestoneText(b.key)}
              onBlur={(e) => setDraft({ ...draft, milestones: { ...draft.milestones, [b.key]: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })}
              className="mt-1"
            />
          </label>
        ))}
      </section>
      <div className="flex items-center justify-between">
        <Link to="/portfolio" className="text-sm font-semibold text-primary">
          Open portfolio ›
        </Link>
        <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}

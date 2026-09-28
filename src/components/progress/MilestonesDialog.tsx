import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { updateProjectFeature } from "@/lib/api";
import { milestonesFor } from "@/lib/progress";
import type { PostFeature } from "./PostUpdateSheet";

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * This job's milestones, per feature (0138): add / remove / rename /
 * reorder, or reset to the preset (Settings › Progress updates, else the
 * app default). A draft, saved together. A list that matches the preset is
 * stored as "use the preset" so later preset edits still reach it.
 */
export function MilestonesDialog({
  open,
  onOpenChange,
  projectId,
  features,
  presets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  features: PostFeature[];
  presets: Record<string, string[]> | undefined;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const presetOf = (f: PostFeature) => milestonesFor(f.category, presets);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries(features.map((f) => [f.id, milestonesFor(f.category, presets, f.milestones)])));
    setAdding({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setList = (id: string, fn: (l: string[]) => string[]) => setDraft((d) => ({ ...d, [id]: fn(d[id] ?? []) }));

  const save = useMutation({
    mutationFn: async () => {
      for (const f of features) {
        const list = (draft[f.id] ?? []).map((m) => m.trim()).filter(Boolean);
        const next = list.length === 0 || same(list, presetOf(f)) ? null : list;
        const current = f.milestones?.length ? f.milestones : null;
        if (JSON.stringify(next) !== JSON.stringify(current)) await updateProjectFeature(f.id, { milestones: next });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-features", projectId] });
      toast({ title: "Milestones saved" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Couldn't save the milestones", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-hairline px-5 py-4 text-left">
          <DialogTitle>Milestones for this job</DialogTitle>
          <DialogDescription>What you pick from when posting an update, and the client's progress tracker. Only this job.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {features.length === 0 && <p className="text-sm text-muted-foreground">This job has no features yet.</p>}
          {features.map((f) => {
            const list = draft[f.id] ?? [];
            const custom = !same(list.map((m) => m.trim()).filter(Boolean), presetOf(f));
            return (
              <div key={f.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{f.label}</p>
                  {custom && (
                    <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setList(f.id, () => presetOf(f))}>
                      Reset to default
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {list.map((m, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <Input
                        value={m}
                        aria-label={`Milestone ${i + 1} for ${f.label}`}
                        onChange={(e) => setList(f.id, (l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                        className="h-10 min-w-0 flex-1"
                      />
                      <Button size="icon" variant="ghost" className="h-10 w-9" aria-label="Move up" disabled={i === 0} onClick={() => setList(f.id, (l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-9" aria-label="Move down" disabled={i === list.length - 1} onClick={() => setList(f.id, (l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-10 w-9 text-destructive" aria-label={`Remove ${m || "milestone"}`} onClick={() => setList(f.id, (l) => l.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = (adding[f.id] ?? "").trim();
                    if (!v) return;
                    setList(f.id, (l) => [...l, v]);
                    setAdding((a) => ({ ...a, [f.id]: "" }));
                  }}
                >
                  <Input value={adding[f.id] ?? ""} onChange={(e) => setAdding((a) => ({ ...a, [f.id]: e.target.value }))} placeholder="Add a milestone" className="h-10" />
                  <Button type="submit" variant="outline" className="h-10" disabled={!(adding[f.id] ?? "").trim()}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button className="font-bold" onClick={() => save.mutate()} disabled={save.isPending || features.length === 0}>
            {save.isPending ? "Saving…" : "Save milestones"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

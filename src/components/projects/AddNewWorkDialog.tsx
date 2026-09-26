import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createAddonQuote, listCategories, listProjectFeatures } from "@/lib/api";
import { liveFeatures } from "@/lib/features";

/**
 * "Add new work" on a Won / in-progress job (0108): pick the new feature
 * types → they're created as proposed features with their own Cost plan
 * sections and an add-on quote for just them. Nothing counts toward the job
 * until the client approves the add-on. Changes to features the job already
 * has are a change order instead — said right here, where the choice is made.
 */
export function AddNewWorkDialog({
  open,
  onOpenChange,
  projectId,
  clientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clientId: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: features = [] } = useQuery({
    queryKey: ["project-features", projectId],
    queryFn: () => listProjectFeatures(projectId),
    enabled: open,
  });
  const onJob = new Set(liveFeatures(features).map((f) => f.category_id));
  const [picked, setPicked] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const createMut = useMutation({
    mutationFn: () =>
      createAddonQuote(projectId, {
        client_id: clientId,
        features: picked.map((category_id) => ({ category_id, label: labels[category_id]?.trim() || null })),
      }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["project-features", projectId] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      setPicked([]);
      setLabels({});
      toast({ title: "Add-on quote created", description: "Measure the new work, price it in the Cost plan, then send the add-on." });
      navigate(`/projects/${projectId}/quotes/${quote.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Add new work</DialogTitle>
          <DialogDescription>
            Completely new features go on an add-on quote. Changing something the job already has (bigger, upgraded,
            removed) is a change order instead.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {categories.map((c) => {
            const on = picked.includes(c.id);
            return (
              <div key={c.id} className={cn("rounded-xl border p-2.5", on ? "border-primary bg-primary/5" : "border-border")}>
                <button type="button" onClick={() => toggle(c.id)} className="flex min-h-10 w-full items-center gap-2.5 text-left">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{onJob.has(c.id) ? `Another ${c.name}` : c.name}</span>
                  {onJob.has(c.id) && <span className="text-[11px] text-muted-subtle">already on this job</span>}
                </button>
                {on && (
                  <Input
                    value={labels[c.id] ?? ""}
                    onChange={(e) => setLabels((l) => ({ ...l, [c.id]: e.target.value }))}
                    placeholder={`Label (optional) — e.g. "Side yard ${c.name.toLowerCase()}"`}
                    className="mt-2 h-10"
                  />
                )}
              </div>
            );
          })}
        </div>

        <Button onClick={() => createMut.mutate()} disabled={picked.length === 0 || createMut.isPending} className="h-11 font-bold">
          <Plus className="mr-1.5 h-4 w-4" />
          {createMut.isPending ? "Creating…" : `Create add-on quote${picked.length > 1 ? ` (${picked.length} features)` : ""}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

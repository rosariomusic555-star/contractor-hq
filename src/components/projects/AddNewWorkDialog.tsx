import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createAddonQuote, listCategories, listProjectFeatures } from "@/lib/api";
import { liveFeatures } from "@/lib/features";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

/**
 * "Add new work" on a Won / in-progress job (0108): pick the new feature
 * types → they're created as proposed features with their own Cost plan
 * sections and an add-on quote for just them. Nothing counts toward the job
 * until the client approves the add-on. Changes to features the job already
 * has are a change order instead — said right here, where the choice is made.
 */
function AddNewWorkDialogInner({
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

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Select all that apply</span>
          <span className="font-semibold text-muted-foreground">{picked.length} selected</span>
        </div>
        <div className="-mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto" role="group" aria-label="New features">
          {categories.map((c) => {
            const on = picked.includes(c.id);
            return (
              <div key={c.id} className={cn("rounded-xl border p-2.5", on ? "border-primary bg-primary/5" : "border-border")}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(c.id)}
                  className="flex min-h-11 w-full items-center gap-3 text-left"
                >
                  <Checkbox checked={on} tabIndex={-1} aria-hidden className="pointer-events-none" />
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

// A crash inside stays inside (see ErrorBoundary).
export const AddNewWorkDialog = withErrorBoundary(AddNewWorkDialogInner, "AddNewWorkDialog");

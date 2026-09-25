import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  createMaterialsSheetWithSections,
  getProject,
  listCategories,
  listSmartSectionSettings,
  projectCategoryIds,
  type MaterialsSheet,
} from "@/lib/api";
import { featureSectionSeeds } from "@/lib/sectionFeatures";

/**
 * "+ Add another materials sheet" — a project's second (third…) sheet is
 * usually added scope covering only some features, so this asks which of
 * the project's features to start sections for (none ticked by default).
 * Every project type is recorded as accounted for, ticked or not, so the
 * unticked ones don't later show the "was added to this project" banner.
 * With no project types it just creates an empty sheet.
 */
export function NewMaterialsSheetDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: (sheet: MaterialsSheet) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId), enabled: open });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories, enabled: open });
  const { data: smartSettings = [] } = useQuery({
    queryKey: ["smart-section-settings"],
    queryFn: listSmartSectionSettings,
    enabled: open,
  });

  const typeIds = project ? projectCategoryIds(project) : [];
  const types = typeIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      createMaterialsSheetWithSections(projectId, {
        name: "New materials sheet",
        // Keep the project's order, whatever order they were ticked in.
        seeds: featureSectionSeeds(typeIds.filter((id) => picked.has(id)), categories, smartSettings),
        projectTypeIds: typeIds,
      }),
    onSuccess: (sheet) => {
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["materials", { project: projectId }] });
      onOpenChange(false);
      onCreated(sheet);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>New materials sheet</DialogTitle>
          <DialogDescription>
            {types.length > 0
              ? "Which features does this sheet cover? Each one starts as its own section."
              : "This project has no project types yet — the sheet starts empty."}
          </DialogDescription>
        </DialogHeader>
        {types.length > 0 && (
          <div className="space-y-1">
            {types.map((c) => (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted/50">
                <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                <span className="text-sm font-medium text-foreground">{c.name}</span>
              </label>
            ))}
          </div>
        )}
        <Button className="w-full font-bold" disabled={createMut.isPending || !project} onClick={() => createMut.mutate()}>
          {createMut.isPending
            ? "Creating…"
            : picked.size > 0
              ? `Create sheet with ${picked.size} ${picked.size === 1 ? "section" : "sections"}`
              : "Create empty sheet"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

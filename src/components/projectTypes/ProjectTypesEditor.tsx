import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReorderControls } from "@/components/common/ReorderControls";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  getCategoryUsage,
  listCategories,
  reassignCategory,
  reorderCategories,
  updateCategory,
  type Category,
  type CategoryUsage,
} from "@/lib/api";
import { DEFAULT_PROJECT_TYPES } from "@/lib/buildTypes";
import { buildTypeForCategoryName, featureKindOf } from "@/lib/measurements";
import { findSmartSectionTemplate } from "@/lib/smartSections";
import { findQuickQuoteTemplate } from "@/lib/quickQuote";
import { moveId } from "@/lib/features";

const USAGE_LABELS: [keyof CategoryUsage, string, string][] = [
  ["opportunities", "opportunity", "opportunities"],
  ["projects", "project", "projects"],
  ["features", "feature", "features"],
  ["quote_lines", "quote line", "quote lines"],
  ["quote_sections", "quote section", "quote sections"],
  ["cost_plan_sections", "cost plan section", "cost plan sections"],
  ["change_order_lines", "change order line", "change order lines"],
  ["labor_entries", "labor entry", "labor entries"],
  ["measurements", "custom measurement", "custom measurements"],
];

/** "Measurements · Smart Section · Quick Quote", or "Custom measurements only". */
function capabilities(name: string): string {
  const bt = buildTypeForCategoryName(name)?.id ?? null;
  const tags = [
    featureKindOf(bt) ? "Measurements" : null,
    bt && findSmartSectionTemplate(bt) ? "Smart Section" : null,
    bt && findQuickQuoteTemplate(bt) ? "Quick Quote" : null,
  ].filter(Boolean);
  return tags.length ? tags.join(" · ") : "Custom measurements only";
}

/**
 * The contractor's one Project types list (the `categories` table — also
 * the quote line / cost plan "category"): add, rename, drag or arrow to
 * reorder, delete with a usage warning and an optional move-to-another-type.
 * Every change saves immediately (a settings list, not a draft editor).
 * The order here is the order every type picker shows. Used by Settings ›
 * Project types and the pickers' quick editor (`compact`).
 */
export function ProjectTypesEditor({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: cats = [], isLoading } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  // Optimistic order while a reorder saves.
  const [order, setOrder] = useState<Category[] | null>(null);
  const shown = order ?? cats;
  useEffect(() => setOrder(null), [cats]);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<Category | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });
  const onError = (e: Error) => {
    setOrder(null);
    toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
  };
  const add = useMutation({
    mutationFn: (name: string) => createCategory({ name, sort_order: cats.length }),
    onSuccess: refresh,
    onError,
  });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, { name }), onSuccess: refresh, onError });
  const reorder = useMutation({ mutationFn: (list: Category[]) => reorderCategories(list), onSuccess: refresh, onError });
  const reset = useMutation({
    mutationFn: async () => {
      const have = new Set(cats.map((c) => c.name.trim().toLowerCase()));
      const missing = DEFAULT_PROJECT_TYPES.filter((n) => !have.has(n.toLowerCase()));
      let next = cats.length;
      for (const n of missing) await createCategory({ name: n, sort_order: next++ });
      return missing.length;
    },
    onSuccess: (n) => {
      refresh();
      toast({ title: n ? `Added ${pluralize(n, "default type")} back` : "All default types are already here" });
    },
    onError,
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= shown.length || from === to) return;
    const ids = moveId(shown.map((c) => c.id), from, to);
    const next = ids.map((id) => shown.find((c) => c.id === id)!);
    setOrder(next);
    reorder.mutate(next);
  };
  const onDragEnd = (r: DropResult) => r.destination && move(r.source.index, r.destination.index);

  const addType = () => {
    const name = newName.trim();
    if (!name || add.isPending) return;
    if (cats.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      toast({ title: `"${name}" is already a project type` });
      return;
    }
    // Cleared right away so a fast second Enter can't append to stale text.
    setNewName("");
    add.mutate(name);
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No project types yet — add one below.</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="project-types">
            {(drop) => (
              <ul ref={drop.innerRef} {...drop.droppableProps} className="divide-y divide-hairline rounded-xl border border-hairline">
                {shown.map((c, i) => (
                  <Draggable key={c.id} draggableId={c.id} index={i}>
                    {(drag, snap) => (
                      <li ref={drag.innerRef} {...drag.draggableProps} className={cn("bg-card", snap.isDragging && "rounded-xl shadow-lg")}>
                        <TypeRow
                          cat={c}
                          compact={compact}
                          onRename={(name) => rename.mutate({ id: c.id, name })}
                          onRemove={() => setRemoving(c)}
                          reorder={
                            <ReorderControls
                              dragHandleProps={drag.dragHandleProps}
                              onMoveUp={() => move(i, i - 1)}
                              onMoveDown={() => move(i, i + 1)}
                              canMoveUp={i > 0}
                              canMoveDown={i < shown.length - 1}
                              label={c.name}
                            />
                          }
                        />
                      </li>
                    )}
                  </Draggable>
                ))}
                {drop.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addType()}
          placeholder="New project type"
          aria-label="New project type"
          className="h-10"
        />
        <Button className="h-10 shrink-0 font-bold" disabled={!newName.trim() || add.isPending} onClick={addType}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {!compact && (
        <Button variant="outline" size="sm" disabled={reset.isPending} onClick={() => reset.mutate()}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Add missing default types
        </Button>
      )}

      <RemoveTypeDialog category={removing} others={cats.filter((c) => c.id !== removing?.id)} onClose={() => setRemoving(null)} />
    </div>
  );
}

function TypeRow({
  cat,
  compact,
  onRename,
  onRemove,
  reorder,
}: {
  cat: Category;
  compact: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  reorder: React.ReactNode;
}) {
  const [v, setV] = useState(cat.name);
  useEffect(() => setV(cat.name), [cat.name]);
  const commit = () => (v.trim() && v.trim() !== cat.name ? onRename(v.trim()) : setV(cat.name));
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={`Rename ${cat.name}`}
          className="h-9 border-transparent bg-transparent px-2 font-semibold hover:border-input focus-visible:border-primary"
        />
        {!compact && <p className="px-2 text-[11px] text-muted-foreground">{capabilities(cat.name)}</p>}
      </div>
      {reorder}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-lg p-2 text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${cat.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Delete a type: shows where it's used; optionally moves all of it to
 * another type first (0156 reassign_category). Never deletes records —
 * only the tag. */
function RemoveTypeDialog({ category, others, onClose }: { category: Category | null; others: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<"remove" | "move">("remove");
  const [target, setTarget] = useState<string>("");
  useEffect(() => {
    setMode("remove");
    setTarget("");
  }, [category?.id]);
  const { data: usage, isLoading } = useQuery({
    queryKey: ["category-usage", category?.id],
    queryFn: () => getCategoryUsage(category!.id),
    enabled: !!category,
    staleTime: 0,
  });
  const used = usage ? USAGE_LABELS.filter(([k]) => usage[k] > 0) : [];

  const run = useMutation({
    mutationFn: async () => {
      if (mode === "move" && target) await reassignCategory(category!.id, target);
      await deleteCategory(category!.id);
    },
    onSuccess: () => {
      for (const key of [["categories"], ["opportunities"], ["projects"], ["quotes"], ["project-features"]]) qc.invalidateQueries({ queryKey: key });
      toast({ title: mode === "move" ? `Moved to ${others.find((o) => o.id === target)?.name} and deleted "${category!.name}"` : `Deleted "${category!.name}"` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });

  return (
    <AlertDialog open={!!category} onOpenChange={(o) => !o && !run.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{category?.name}”?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {isLoading ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking where it's used…
                </p>
              ) : usage === null ? (
                <p>Anything tagged with it becomes untyped — nothing else is deleted.</p>
              ) : used.length === 0 ? (
                <p>It isn't used anywhere.</p>
              ) : (
                <>
                  <p className="text-foreground">
                    Used on {used.map(([k, one, many]) => pluralize(usage![k], one, many)).join(", ")}. Nothing is deleted — choose what happens to
                    the tag:
                  </p>
                  <RadioGroup value={mode} onValueChange={(v) => setMode(v as "remove" | "move")} className="gap-3">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="remove" id="rt-remove" className="mt-0.5" />
                      <Label htmlFor="rt-remove" className="font-normal leading-snug">
                        Just remove the tag <span className="text-muted-foreground">— those records become untyped</span>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="move" id="rt-move" className="mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="rt-move" className="font-normal leading-snug">
                          Move everything to another type
                        </Label>
                        {mode === "move" && (
                          <Select value={target} onValueChange={setTarget}>
                            <SelectTrigger aria-label="Move to">
                              <SelectValue placeholder="Pick a type…" />
                            </SelectTrigger>
                            <SelectContent>
                              {others.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </RadioGroup>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={run.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isLoading || run.isPending || (mode === "move" && !target)}
            onClick={() => run.mutate()}
          >
            {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "move" ? "Move & delete" : "Delete type"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

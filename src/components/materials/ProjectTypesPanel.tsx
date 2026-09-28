import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { createCategory, deleteCategory, listCategories, updateCategory, type Category } from "@/lib/api";
import { DEFAULT_PROJECT_TYPES } from "@/lib/buildTypes";
import { buildTypeForCategoryName, featureKindOf } from "@/lib/measurements";
import { findSmartSectionTemplate } from "@/lib/smartSections";
import { findQuickQuoteTemplate } from "@/lib/quickQuote";

/**
 * Project types — the contractor's one list (Job Categories, the same list
 * Settings › Categories edits): what the opportunity "Project type"
 * dropdown, quote line categories and Revenue by category use. A type whose
 * name matches a build type gets that type's measurement card, Smart
 * Section calculator and Quick Quote. Reset re-adds missing defaults only.
 */
export function ProjectTypesPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<Category | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });
  const onError = (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
  const add = useMutation({ mutationFn: (n: string) => createCategory({ name: n, sort_order: cats.length }), onSuccess: () => (setName(""), refresh()), onError });
  const rename = useMutation({ mutationFn: ({ id, n }: { id: string; n: string }) => updateCategory(id, { name: n }), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: string) => deleteCategory(id), onSuccess: () => (setRemoving(null), refresh()), onError });
  const reset = useMutation({
    mutationFn: async () => {
      const have = new Set(cats.map((c) => c.name.trim().toLowerCase()));
      const missing = DEFAULT_PROJECT_TYPES.filter((n) => !have.has(n.toLowerCase()));
      let order = cats.length;
      for (const n of missing) await createCategory({ name: n, sort_order: order++ });
      return missing.length;
    },
    onSuccess: (n) => (refresh(), toast({ title: n ? `Added ${n} default type${n === 1 ? "" : "s"} back` : "All default types are already here" })),
    onError,
  });

  return (
    <section className="card-surface overflow-hidden p-0">
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">Project types</h2>
          <p className="text-xs text-muted-foreground">Your one list — the opportunity dropdown, quote categories and Revenue by category.</p>
        </div>
        <Button variant="outline" size="sm" className="h-9 shrink-0" disabled={reset.isPending} onClick={() => reset.mutate()}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to default
        </Button>
      </header>
      <ul className="divide-y divide-hairline">
        {cats.map((c) => (
          <TypeRow key={c.id} cat={c} onRename={(n) => rename.mutate({ id: c.id, n })} onRemove={() => setRemoving(c)} />
        ))}
      </ul>
      <div className="flex gap-2 border-t border-hairline px-5 py-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add.mutate(name.trim())} placeholder="New project type" className="h-10" />
        <Button className="h-10" disabled={!name.trim() || add.isPending} onClick={() => add.mutate(name.trim())}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It's taken off opportunities, projects and quote lines that use it (they become uncategorized). Reset to default can add a default type back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removing && remove.mutate(removing.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TypeRow({ cat, onRename, onRemove }: { cat: Category; onRename: (n: string) => void; onRemove: () => void }) {
  const [v, setV] = useState(cat.name);
  const bt = buildTypeForCategoryName(cat.name)?.id ?? null;
  const tags = [featureKindOf(bt) ? "Measurements" : null, bt && findSmartSectionTemplate(bt) ? "Smart Section" : null, bt && findQuickQuoteTemplate(bt) ? "Quick Quote" : null].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center gap-2 px-5 py-2">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => (v.trim() && v.trim() !== cat.name ? onRename(v.trim()) : setV(cat.name))}
        className="h-9 min-w-[10rem] flex-1 border-transparent bg-transparent px-2 font-semibold hover:border-input focus-visible:border-primary"
      />
      <span className="text-[11px] text-muted-foreground">{tags.length ? tags.join(" · ") : "Custom measurements only"}</span>
      <button type="button" onClick={onRemove} className="rounded-lg p-2 text-muted-subtle hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${cat.name}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

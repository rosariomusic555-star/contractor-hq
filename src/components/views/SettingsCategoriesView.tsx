import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Tag, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from "@/lib/api";

/**
 * Real, persisted CRUD list (categories table, 0017) — unlike most of
 * Settings, this saves each action immediately rather than using the
 * draft+Save pattern (that's for line-item/section editors, not a settings
 * list). Renaming a category is used on quote line items; deleting one sets
 * category_id to null on any line items that had it, so they just become
 * uncategorized (0019's on delete set null) — no reassignment UI needed.
 */
export function SettingsCategoriesView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["categories"] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: (name: string) => createCategory({ name, sort_order: categories.length }),
    onSuccess: invalidate,
    onError,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, { name }),
    onSuccess: invalidate,
    onError,
  });

  const reorderMut = useMutation({
    mutationFn: (updates: { id: string; sort_order: number }[]) =>
      Promise.all(updates.map((u) => updateCategory(u.id, { sort_order: u.sort_order }))),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Category deleted" });
    },
    onError,
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const a = categories[index];
    const b = categories[target];
    reorderMut.mutate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  const addCategory = () => {
    if (createMut.isPending) return;
    const name = newName.trim();
    if (!name) return;
    // Cleared immediately (not in onSuccess) — the create is async, and
    // leaving stale text in the field let a fast second Enter/click append
    // to it instead of starting a fresh name, producing concatenated junk.
    setNewName("");
    createMut.mutate(name);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Categories" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Categories</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Tag className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Used to tag quote line items</span>
        </div>

        <div className="bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Assigning a category to a line item is optional. Deleting a category here makes its
            line items uncategorized — it never deletes the line items themselves.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : categories.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No categories yet — add one below.</p>
          ) : (
            <div className="mt-4 divide-y divide-hairline">
              {categories.map((c, i) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  isFirst={i === 0}
                  isLast={i === categories.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRename={(name) => renameMut.mutate({ id: c.id, name })}
                  onDelete={() => deleteMut.mutate(c.id)}
                />
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="New category name"
              className="h-11"
            />
            <Button
              onClick={addCategory}
              disabled={!newName.trim() || createMut.isPending}
              className="h-11 shrink-0 rounded-xl font-bold"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);

  return (
    <div className="flex items-center gap-2 py-2.5">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Move up"
          className="text-muted-subtle transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move down"
          className="text-muted-subtle transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== category.name) onRename(trimmed);
          else setName(category.name);
        }}
        className="h-10 flex-1 border-transparent bg-transparent px-2 font-semibold hover:border-input hover:bg-muted focus-visible:border-primary focus-visible:bg-background"
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${category.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{category.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Any quote line items tagged with this category become uncategorized. This doesn't
              delete or change the line items themselves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

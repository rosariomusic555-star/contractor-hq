import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Megaphone, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
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
  listLeadSources,
  createLeadSource,
  updateLeadSource,
  deleteLeadSource,
  type LeadSource,
} from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

/**
 * Real, persisted CRUD list (lead_sources table, 0077) — same shape and
 * save-immediately pattern as Settings > Categories. Backs the "Lead
 * source" dropdown on the opportunity page; opportunities.lead_source
 * stays a plain text column (same denormalized-not-FK shape as
 * Suppliers), so deleting a lead source here never touches existing
 * opportunities — they keep whatever value they were saved with.
 */
export function SettingsLeadSourcesView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: leadSources = [], isLoading } = useQuery({
    queryKey: ["lead-sources"],
    queryFn: listLeadSources,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead-sources"] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: (name: string) => createLeadSource({ name, sort_order: leadSources.length }),
    onSuccess: invalidate,
    onError,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateLeadSource(id, { name }),
    onSuccess: invalidate,
    onError,
  });

  const reorderMut = useMutation({
    mutationFn: (updates: { id: string; sort_order: number }[]) =>
      Promise.all(updates.map((u) => updateLeadSource(u.id, { sort_order: u.sort_order }))),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLeadSource(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lead source deleted" });
    },
    onError,
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= leadSources.length) return;
    const a = leadSources[index];
    const b = leadSources[target];
    reorderMut.mutate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  const addLeadSource = () => {
    if (createMut.isPending) return;
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    createMut.mutate(name);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Lead sources" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Lead sources</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Megaphone className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Where your leads come from</span>
        </div>

        <div className="bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Powers the "Lead source" dropdown on a pipeline lead and the "By source" pipeline
            report. Deleting one here never changes an existing lead — it keeps whatever it was
            saved with.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : leadSources.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No lead sources yet — add one below.</p>
          ) : (
            <div className="mt-4 divide-y divide-hairline">
              {leadSources.map((s, i) => (
                <LeadSourceRow
                  key={s.id}
                  leadSource={s}
                  isFirst={i === 0}
                  isLast={i === leadSources.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRename={(name) => renameMut.mutate({ id: s.id, name })}
                  onDelete={() => deleteMut.mutate(s.id)}
                />
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLeadSource()}
              placeholder="New lead source"
              className="h-11"
            />
            <Button
              onClick={addLeadSource}
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

function LeadSourceRow({
  leadSource,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: {
  leadSource: LeadSource;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(leadSource.name);

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
          if (trimmed && trimmed !== leadSource.name) onRename(trimmed);
          else setName(leadSource.name);
        }}
        className="h-10 flex-1 border-transparent bg-transparent px-2 font-semibold hover:border-input hover:bg-muted focus-visible:border-primary focus-visible:bg-background"
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${leadSource.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{leadSource.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing leads keep this value — deleting it here only removes it from the dropdown
              for future leads.
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

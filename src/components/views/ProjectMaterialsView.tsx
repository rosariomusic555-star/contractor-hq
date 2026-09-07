import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getProject,
  listMaterials,
  createMaterialsSection,
  updateMaterialsSection,
  deleteMaterialsSection,
  addMaterialsItem,
  updateMaterialsItem,
  deleteMaterialsItem,
  type MaterialsSection,
  type MaterialsItem,
} from "@/lib/api";

type LiveValues = Record<string, { quantity: number; unit_cost: number }>;

export function ProjectMaterialsView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: sections = [], isLoading, isError, error } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
  });

  // Local live values drive instant total recalculation; Supabase is only
  // written to on blur (see ItemRow). Re-seeded whenever the server data
  // (re)loads, e.g. after a save elsewhere in the sheet.
  const [live, setLive] = useState<LiveValues>({});
  useEffect(() => {
    const next: LiveValues = {};
    for (const section of sections) {
      for (const item of section.materials_items) {
        next[item.id] = { quantity: Number(item.quantity), unit_cost: Number(item.unit_cost) };
      }
    }
    setLive(next);
  }, [sections]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["materials", { project: id }] });
  const invalidateProjects = () => qc.invalidateQueries({ queryKey: ["projects"] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addSectionMut = useMutation({
    mutationFn: () => createMaterialsSection(id, { name: "New section", sort_order: sections.length }),
    onSuccess: () => {
      invalidate();
      invalidateProjects();
    },
    onError,
  });
  const renameSectionMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => updateMaterialsSection(v.id, { name: v.name }),
    onSuccess: invalidate,
    onError,
  });
  const deleteSectionMut = useMutation({
    mutationFn: (sectionId: string) => deleteMaterialsSection(sectionId),
    onSuccess: () => {
      invalidate();
      invalidateProjects();
    },
    onError,
  });
  const addItemMut = useMutation({
    mutationFn: (v: { sectionId: string; sortOrder: number }) =>
      addMaterialsItem(v.sectionId, { sort_order: v.sortOrder }),
    onSuccess: () => {
      invalidate();
      invalidateProjects();
    },
    onError,
  });
  const saveItemMut = useMutation({
    mutationFn: (v: { itemId: string; patch: Parameters<typeof updateMaterialsItem>[1] }) =>
      updateMaterialsItem(v.itemId, v.patch),
    onSuccess: () => {
      invalidate();
      invalidateProjects();
    },
    onError,
  });
  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => deleteMaterialsItem(itemId),
    onSuccess: () => {
      invalidate();
      invalidateProjects();
    },
    onError,
  });

  const liveFor = (item: MaterialsItem) =>
    live[item.id] ?? { quantity: Number(item.quantity), unit_cost: Number(item.unit_cost) };

  const sectionSubtotal = (section: MaterialsSection) =>
    section.materials_items.reduce((sum, item) => {
      const v = liveFor(item);
      return sum + v.quantity * v.unit_cost;
    }, 0);

  const grandTotal = sections.reduce((sum, section) => sum + sectionSubtotal(section), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Materials sheet</h1>
          <p className="text-muted-foreground mt-1">{project?.name ?? " "}</p>
        </div>
        <Button
          onClick={() => addSectionMut.mutate()}
          className="font-bold w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add section
        </Button>
      </div>

      <div className="stat-card flex items-center justify-between">
        <span className="text-muted-foreground">Total cost</span>
        <span className="text-2xl font-bold text-foreground">{formatCurrency(grandTotal)}</span>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading materials sheet…</p>}
      {isError && (
        <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && sections.length === 0 && (
        <div className="stat-card flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">No costs added yet. Add a section to get started.</p>
          <Button
            onClick={() => addSectionMut.mutate()}
            className="font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add section
          </Button>
        </div>
      )}

      {!isLoading && !isError && sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              subtotal={sectionSubtotal(section)}
              liveFor={liveFor}
              onRename={(name) => renameSectionMut.mutate({ id: section.id, name })}
              onDeleteSection={() => deleteSectionMut.mutate(section.id)}
              onAddItem={() =>
                addItemMut.mutate({ sectionId: section.id, sortOrder: section.materials_items.length })
              }
              onLiveChange={(itemId, patch) =>
                setLive((prev) => ({ ...prev, [itemId]: { ...liveForId(prev, itemId), ...patch } }))
              }
              onSaveItem={(itemId, patch) => saveItemMut.mutate({ itemId, patch })}
              onDeleteItem={(itemId) => deleteItemMut.mutate(itemId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function liveForId(live: LiveValues, itemId: string) {
  return live[itemId] ?? { quantity: 0, unit_cost: 0 };
}

interface SectionCardProps {
  section: MaterialsSection;
  subtotal: number;
  liveFor: (item: MaterialsItem) => { quantity: number; unit_cost: number };
  onRename: (name: string) => void;
  onDeleteSection: () => void;
  onAddItem: () => void;
  onLiveChange: (itemId: string, patch: Partial<{ quantity: number; unit_cost: number }>) => void;
  onSaveItem: (itemId: string, patch: { name?: string; quantity?: number; unit_cost?: number }) => void;
  onDeleteItem: (itemId: string) => void;
}

function SectionCard({
  section,
  subtotal,
  liveFor,
  onRename,
  onDeleteSection,
  onAddItem,
  onLiveChange,
  onSaveItem,
  onDeleteItem,
}: SectionCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(section.name);

  useEffect(() => setNameDraft(section.name), [section.name]);

  const items = section.materials_items;

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== section.name) onRename(trimmed);
    else setNameDraft(section.name);
  };

  return (
    <div className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        {editingName ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNameDraft(section.name);
                setEditingName(false);
              }
            }}
            className="h-8 max-w-xs font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="text-left font-medium text-foreground hover:underline underline-offset-2"
          >
            {section.name || "Untitled section"}
          </button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {items.length > 0
                  ? `This section has ${items.length} item${items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)}. Deleting it removes those items too. This can't be undone.`
                  : "This section is empty. This can't be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDeleteSection}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium py-1 px-1">Item</th>
                <th className="text-right font-medium py-1 px-1 w-24">Qty</th>
                <th className="text-right font-medium py-1 px-1 w-32">Unit cost</th>
                <th className="text-right font-medium py-1 px-1 w-32">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  live={liveFor(item)}
                  onLiveChange={(patch) => onLiveChange(item.id, patch)}
                  onSave={(patch) => onSaveItem(item.id, patch)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="w-4 h-4 mr-1" />
          Add item
        </Button>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Subtotal</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: MaterialsItem;
  live: { quantity: number; unit_cost: number };
  onLiveChange: (patch: Partial<{ quantity: number; unit_cost: number }>) => void;
  onSave: (patch: { name?: string; quantity?: number; unit_cost?: number }) => void;
  onDelete: () => void;
}

function ItemRow({ item, live, onLiveChange, onSave, onDelete }: ItemRowProps) {
  const [name, setName] = useState(item.name);
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [costStr, setCostStr] = useState(String(item.unit_cost));

  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setCostStr(String(item.unit_cost)), [item.unit_cost]);

  const total = live.quantity * live.unit_cost;
  const fieldClass = "h-8 border-0 shadow-none bg-transparent focus-visible:ring-1 focus-visible:ring-offset-0 px-2";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1 px-0">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onSave({ name })}
          placeholder="Item name"
          className={fieldClass}
        />
      </td>
      <td className="py-1 px-0">
        <Input
          type="number"
          step="any"
          value={qtyStr}
          onChange={(e) => {
            setQtyStr(e.target.value);
            onLiveChange({ quantity: parseFloat(e.target.value) || 0 });
          }}
          onBlur={() => onSave({ quantity: parseFloat(qtyStr) || 0 })}
          className={`${fieldClass} text-right`}
        />
      </td>
      <td className="py-1 px-0">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            value={costStr}
            onChange={(e) => {
              setCostStr(e.target.value);
              onLiveChange({ unit_cost: parseFloat(e.target.value) || 0 });
            }}
            onBlur={() => onSave({ unit_cost: parseFloat(costStr) || 0 })}
            className={`${fieldClass} text-right pl-5`}
          />
        </div>
      </td>
      <td className="py-1 px-1 text-right text-muted-foreground tabular-nums whitespace-nowrap">
        {formatCurrency(total)}
      </td>
      <td className="py-1 px-1">
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

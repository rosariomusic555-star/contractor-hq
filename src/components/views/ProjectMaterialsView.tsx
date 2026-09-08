import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
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
import { cn, formatCurrency } from "@/lib/utils";
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
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Draft model — the whole sheet is edited locally and only written to
// Supabase when "Save changes" is pressed. New rows get a "tmp-" id.
// ---------------------------------------------------------------------------

interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
}
interface DraftSection {
  id: string;
  name: string;
  items: DraftItem[];
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const seed = (sections: MaterialsSection[]): DraftSection[] =>
  sections.map((s) => ({
    id: s.id,
    name: s.name,
    items: s.materials_items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
    })),
  }));

const itemChanged = (a: DraftItem, b: { name: string; quantity: number; unit_cost: number }) =>
  a.name !== b.name || a.quantity !== b.quantity || a.unit_cost !== b.unit_cost;

export function ProjectMaterialsView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: sections = [], isLoading, isError, error } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = useState<DraftSection[]>([]);
  const dirty = useRef(false);

  // Seed the draft from the server — but never clobber unsaved edits.
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(sections));
  }, [sections]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: DraftSection[]) => DraftSection[]) => {
    markDirty();
    setDraft((d) => fn(d));
  };

  const discard = () => {
    dirty.current = false;
    setDraft(seed(sections));
  };

  // --- local mutators -------------------------------------------------------
  const renameSection = (sid: string, name: string) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, name } : s)));
  const deleteSection = (sid: string) => edit((d) => d.filter((s) => s.id !== sid));
  const addSection = () =>
    edit((d) => [...d, { id: tmpId(), name: "", items: [] }]);
  const addItem = (sid: string) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? { ...s, items: [...s.items, { id: tmpId(), name: "", quantity: 0, unit_cost: 0 }] }
          : s,
      ),
    );
  const editItem = (sid: string, iid: string, patch: Partial<DraftItem>) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? { ...s, items: s.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }
          : s,
      ),
    );
  const deleteItem = (sid: string, iid: string) =>
    edit((d) =>
      d.map((s) => (s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== iid) } : s)),
    );

  // --- save (diff draft against the server data) --------------------------
  const saveMut = useMutation({
    mutationFn: async () => {
      const serverSections = new Map(sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.map((s) => s.id));

      // 1. deletes — server sections no longer in the draft (cascades their items)
      for (const s of sections) {
        if (!draftSectionIds.has(s.id)) await deleteMaterialsSection(s.id);
      }

      // 2. per section: create / rename, then its items
      for (let si = 0; si < draft.length; si++) {
        const ds = draft[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await createMaterialsSection(id, { name, sort_order: si });
          sectionId = created.id;
        } else if (server.name !== name) {
          await updateMaterialsSection(server.id, { name });
        }

        const serverItems = new Map((server?.materials_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        // 2a. item deletes (skip if the section itself is new — nothing to delete)
        if (server) {
          for (const i of server.materials_items) {
            if (!draftItemIds.has(i.id)) await deleteMaterialsItem(i.id);
          }
        }

        // 2b. item creates / updates
        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const srv = serverItems.get(di.id);
          if (!srv) {
            await addMaterialsItem(sectionId, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              sort_order: ii,
            });
          } else if (
            itemChanged(di, {
              name: srv.name,
              quantity: Number(srv.quantity),
              unit_cost: Number(srv.unit_cost),
            })
          ) {
            await updateMaterialsItem(srv.id, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
            });
          }
        }
      }
    },
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["materials", { project: id }] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Materials sheet saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const grandTotal = useMemo(
    () =>
      draft.reduce(
        (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0),
        0,
      ),
    [draft],
  );

  const isDirty = dirty.current;

  return (
    <div className={cn("mx-auto max-w-4xl animate-fade-in space-y-5", isDirty && "pb-40 md:pb-28")}>
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Materials sheet</h1>
          <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
        </div>
        <Button onClick={addSection} className="w-full font-bold sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add section
        </Button>
      </div>

      <div className="card-surface flex items-center justify-between p-5">
        <span className="text-muted-foreground">Total cost</span>
        <span className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(grandTotal)}</span>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading materials sheet…</p>}
      {isError && <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>}

      {!isLoading && !isError && draft.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          Add a section to get started.
        </div>
      )}

      {draft.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          onRename={(name) => renameSection(section.id, name)}
          onDelete={() => deleteSection(section.id)}
          onAddItem={() => addItem(section.id)}
          onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
          onDeleteItem={(iid) => deleteItem(section.id, iid)}
        />
      ))}

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: DraftSection;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (itemId: string) => void;
}

function SectionCard({ section, onRename, onDelete, onAddItem, onEditItem, onDeleteItem }: SectionCardProps) {
  const subtotal = section.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0);

  return (
    <div className="card-surface space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={section.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="New section"
          className="h-9 max-w-xs font-semibold"
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {section.items.length > 0
                  ? `Removes ${section.items.length} item${section.items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)} from the sheet. Nothing is saved until you press Save changes.`
                  : "This section is empty."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {section.items.length > 0 && (
        <>
          {/* column headers — wide screens only; below lg the rows stack so
              the item name always gets a full-width line */}
          <div className="hidden gap-3 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-subtle lg:grid lg:grid-cols-[minmax(8rem,1fr)_5rem_7rem_6rem_1.5rem]">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit cost</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <div className="space-y-2 lg:space-y-1">
            {section.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onEdit={(patch) => onEditItem(item.id, patch)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="mr-1 h-4 w-4" />
          Add item
        </Button>
        <div className="text-sm">
          <span className="mr-2 text-muted-foreground">Subtotal</span>
          <span className="font-bold tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: DraftItem;
  onEdit: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
}

function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [costStr, setCostStr] = useState(String(item.unit_cost));
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setCostStr(String(item.unit_cost)), [item.unit_cost]);

  const total = item.quantity * item.unit_cost;
  const numClass = "h-9 text-right";

  return (
    <div className="rounded-xl border border-hairline p-2.5 lg:grid lg:grid-cols-[minmax(8rem,1fr)_5rem_7rem_6rem_1.5rem] lg:items-center lg:gap-3 lg:border-0 lg:p-0">
      {/* Name — full-width line below lg, first column at lg+. Textarea so a
          long name wraps instead of scrolling off in one line. */}
      <AutoGrowTextarea
        value={item.name}
        onChange={(e) => onEdit({ name: e.target.value })}
        placeholder="Item name"
      />

      <div className="mt-2 flex items-center gap-2 lg:mt-0 lg:contents">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={qtyStr}
          onChange={(e) => {
            setQtyStr(e.target.value);
            onEdit({ quantity: parseFloat(e.target.value) || 0 });
          }}
          className={cn(numClass, "min-w-0 flex-1 lg:flex-none")}
          aria-label="Quantity"
        />
        <span className="text-muted-subtle lg:hidden">×</span>
        <div className="relative min-w-0 flex-1 lg:flex-none">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={costStr}
            onChange={(e) => {
              setCostStr(e.target.value);
              onEdit({ unit_cost: parseFloat(e.target.value) || 0 });
            }}
            className={cn(numClass, "pl-5")}
            aria-label="Unit cost"
          />
        </div>
        <span className="text-muted-subtle lg:hidden">=</span>
        <span className="shrink-0 text-right text-sm font-bold tabular-nums text-foreground lg:font-semibold lg:text-muted-foreground">
          {formatCurrency(total)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

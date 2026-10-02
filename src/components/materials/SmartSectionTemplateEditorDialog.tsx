import { useEffect, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ReorderControls } from "@/components/common/ReorderControls";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  listMaterialCategories,
  listSmartSectionSettings,
  saveSmartSectionSettings,
  resetSmartSectionSettings,
  type SmartSectionLineItemSetting,
} from "@/lib/api";
import { COST_TYPE_LABEL, LINE_COST_TYPES, type LineCostType } from "@/lib/costPlanMath";
import {
  findSmartSectionTemplate,
  findSmartSectionSettings,
  lineCategoryMissing,
  resolveEffectiveLineItems,
  resolveLineCategoryId,
  resolveTunableValue,
} from "@/lib/smartSections";

/**
 * The one editor both entry points open: Settings > Manage Smart Section
 * Templates, and the gear icon on the "What are you building?" picker.
 * Editing here only changes what *future* Smart Sections of this build
 * type generate/calculate for this contractor — sections already created
 * keep whatever line items/quantities they already have (a natural
 * consequence of matching by name, not special-cased here).
 */
export function SmartSectionTemplateEditorDialog({
  open,
  onOpenChange,
  buildTypeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildTypeId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const template = findSmartSectionTemplate(buildTypeId);

  const { data: allSettings = [] } = useQuery({
    queryKey: ["smart-section-settings"],
    queryFn: listSmartSectionSettings,
    enabled: open,
  });
  const settings = template ? findSmartSectionSettings(allSettings, template.id) : null;
  const { data: materialCategories = [] } = useQuery({ queryKey: ["material-categories"], queryFn: listMaterialCategories, enabled: open });

  // _k: a stable key per row for drag-and-drop (never saved).
  type Row = SmartSectionLineItemSetting & { _k: string };
  const rowKey = () => crypto.randomUUID();
  const [lineItems, setLineItems] = useState<Row[]>([]);
  // undefined = blank field = use the template default (no override saved).
  const [tunables, setTunables] = useState<Record<string, number | undefined>>({});
  const [laborCrew, setLaborCrew] = useState("");
  const [laborDays, setLaborDays] = useState("");

  useEffect(() => {
    if (!open || !template) return;
    setLineItems(resolveEffectiveLineItems(template, settings).map((li) => ({ ...li, _k: rowKey() })));
    const seeded: Record<string, number> = {};
    for (const t of template.tunables) seeded[t.key] = resolveTunableValue(template, settings, t.key);
    setTunables(seeded);
    setLaborCrew(settings?.labor_default?.crew_size != null ? String(settings.labor_default.crew_size) : "");
    setLaborDays(settings?.labor_default?.days != null ? String(settings.labor_default.days) : "");
    // Re-seeds once the settings query resolves too — on a fresh page
    // load the dialog can mount before listSmartSectionSettings returns,
    // and without allSettings here the draft would stay stuck on app
    // defaults even after the contractor's real customization arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, buildTypeId, allSettings]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSmartSectionSettings(buildTypeId, {
        line_items: lineItems
          .filter((li) => li.name.trim() !== "")
          .map(({ _k, ...li }) => (li.description !== undefined ? { ...li, description: li.description.trim() || null } : li)),
        // Only real numbers are saved; a cleared field goes back to the default.
        tunables: Object.fromEntries(
          Object.entries(tunables).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])),
        ),
        labor_default:
          laborCrew || laborDays
            ? { crew_size: laborCrew ? Number(laborCrew) : null, days: laborDays ? Number(laborDays) : null }
            : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-section-settings"] });
      toast({ title: "Template saved" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const resetMut = useMutation({
    mutationFn: () => resetSmartSectionSettings(buildTypeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-section-settings"] });
      toast({ title: "Reset to default" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (!template) return null;

  const moveLineItem = (index: number, dir: -1 | 1) =>
    setLineItems((items) => {
      const next = [...items];
      const target = index + dir;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const renameLineItem = (index: number, name: string) =>
    setLineItems((items) => items.map((li, i) => (i === index ? { ...li, name } : li)));
  const setLineItemType = (index: number, cost_type: LineCostType) =>
    setLineItems((items) =>
      items.map((li, i) => {
        if (i !== index) return li;
        // Material = no cost_type key; a non-material line has no category.
        const { cost_type: _old, ...rest } = li;
        return cost_type === "material" ? rest : { ...rest, cost_type, material_category_id: null };
      }),
    );
  // 0162 — the line's default category / description. Choosing one stores
  // it; until then the row shows the template's default.
  const setLineItemCategory = (index: number, material_category_id: string | null) =>
    setLineItems((items) => items.map((li, i) => (i === index ? { ...li, material_category_id } : li)));
  const setLineItemDescription = (index: number, description: string) =>
    setLineItems((items) => items.map((li, i) => (i === index ? { ...li, description } : li)));
  const removeLineItem = (index: number) => setLineItems((items) => items.filter((_, i) => i !== index));
  const addLineItem = () => setLineItems((items) => [...items, { _k: rowKey(), slot_key: null, name: "" }]);
  const onDragEnd = (r: DropResult) => {
    if (!r.destination || r.destination.index === r.source.index) return;
    setLineItems((items) => {
      const next = [...items];
      const [moved] = next.splice(r.source.index, 1);
      next.splice(r.destination!.index, 0, moved);
      return next;
    });
  };

  const nameForSlot = (slotKey: string) =>
    lineItems.find((li) => li.slot_key === slotKey)?.name ??
    template.lineItemSlots.find((s) => s.key === slotKey)?.defaultName ??
    slotKey;

  // Group tunables by their related slot, in lineItemSlots order, so the
  // "calculator defaults" section reads top-to-bottom the same as the
  // line items above it.
  const tunablesBySlot = template.lineItemSlots
    .map((slot) => ({ slot, tunables: template.tunables.filter((t) => t.relatedSlotKey === slot.key) }))
    .filter((g) => g.tunables.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{template.label} template</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">Line items</h3>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="template-line-items">
                {(drop) => (
                  <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-2">
                    {lineItems.map((li, i) => (
                      <Draggable key={li._k} draggableId={li._k} index={i}>
                        {(drag, snap) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className={cn("space-y-1.5 rounded-lg border border-hairline bg-background p-2", snap.isDragging && "shadow-lg")}
                          >
                  <div className="flex items-center gap-1.5">
                  <Input
                    value={li.name}
                    onChange={(e) => renameLineItem(i, e.target.value)}
                    placeholder="Item name"
                    className="h-9 min-w-0"
                  />
                  {li.slot_key ? (
                    // A calculator slot always computes a material quantity.
                    <span className="flex h-9 w-[112px] shrink-0 items-center px-3 text-xs font-semibold text-muted-foreground">
                      Material
                    </span>
                  ) : (
                    <Select value={li.cost_type ?? "material"} onValueChange={(v) => setLineItemType(i, v as LineCostType)}>
                      <SelectTrigger aria-label="Line type" className="h-9 w-[112px] shrink-0 text-xs font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LINE_COST_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {COST_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <ReorderControls
                    dragHandleProps={drag.dragHandleProps}
                    onMoveUp={() => moveLineItem(i, -1)}
                    onMoveDown={() => moveLineItem(i, 1)}
                    canMoveUp={i > 0}
                    canMoveDown={i < lineItems.length - 1}
                    label={li.name || "line item"}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  </div>
                  {/* 0162 — default category (materials) and description. */}
                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    {(li.cost_type ?? "material") === "material" && (
                      <div className="sm:w-48 sm:shrink-0">
                        <Select
                          value={resolveLineCategoryId(template, li, materialCategories) ?? "__none__"}
                          onValueChange={(v) => setLineItemCategory(i, v === "__none__" ? null : v)}
                        >
                          <SelectTrigger aria-label="Default category" className="h-9 text-xs">
                            <SelectValue placeholder="Uncategorized" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Uncategorized</SelectItem>
                            {materialCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {lineCategoryMissing(template, li, materialCategories) && (
                          <p className="mt-0.5 text-[11px] font-semibold text-warning-strong">Category was deleted — choose category</p>
                        )}
                      </div>
                    )}
                    <Input
                      value={li.description ?? ""}
                      onChange={(e) => setLineItemDescription(i, e.target.value)}
                      placeholder="Default description (optional)"
                      aria-label="Default description"
                      className="h-9 min-w-0 flex-1 text-xs"
                    />
                  </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {drop.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <button
              type="button"
              onClick={addLineItem}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line item
            </button>
            <p className="text-[11px] text-muted-subtle">
              A line item added here with no matching calculator slot is name-only, same as step 1 today
              — the calculator will never fill in a quantity for it. Added lines can be a subcontractor,
              equipment or other cost instead of a material.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">Labor default</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Crew size</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={laborCrew}
                  onChange={(e) => setLaborCrew(e.target.value)}
                  placeholder="—"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Days</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={laborDays}
                  onChange={(e) => setLaborDays(e.target.value)}
                  placeholder="—"
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-subtle">
              Pre-fills a new section&apos;s labor block (8 hrs/day at your default labor rate). Leave both
              blank for no labor.
            </p>
          </div>

          {tunablesBySlot.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">
                Calculator defaults
              </h3>
              {tunablesBySlot.map(({ slot, tunables: group }) => (
                <div key={slot.key} className="space-y-2 rounded-xl border border-hairline p-3">
                  <div className="text-xs font-bold text-foreground">{nameForSlot(slot.key)}</div>
                  <div className="divide-y divide-hairline">
                    {group.map((t) => (
                      // One aligned row: label · value + unit (right).
                      <div key={t.key} className="flex items-center justify-between gap-3 py-1.5">
                        <Label htmlFor={`tunable-${t.key}`} className="min-w-0 flex-1 text-[13px] font-normal text-foreground">
                          {t.label}
                        </Label>
                        <div className="relative w-36 shrink-0">
                          <Input
                            id={`tunable-${t.key}`}
                            type="number"
                            step="any"
                            inputMode="decimal"
                            // Blank shows the default as a hint; clearing never snaps to 0.
                            value={tunables[t.key] ?? ""}
                            placeholder={`${t.defaultValue} (default)`}
                            onChange={(e) =>
                              setTunables((v) => ({ ...v, [t.key]: e.target.value === "" ? undefined : parseFloat(e.target.value) }))
                            }
                            // No browser spinner arrows — they collided with the unit label.
                            className="h-9 pr-[4.5rem] text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 max-w-[4rem] -translate-y-1/2 truncate text-[11px] text-muted-foreground">
                            {t.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-subtle">
                Waste % is set per line item on the cost plan itself, not here.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-10 rounded-xl text-xs" disabled={resetMut.isPending}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset "{template.label}" to default?</AlertDialogTitle>
                <AlertDialogDescription>
                  Restores the app's standard line items, calculator numbers and labor default for this
                  build type. Cost plans you've already created are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => resetMut.mutate()}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="h-10 flex-1 rounded-xl font-bold"
          >
            {saveMut.isPending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

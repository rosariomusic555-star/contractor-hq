import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  listSmartSectionSettings,
  saveSmartSectionSettings,
  resetSmartSectionSettings,
  type SmartSectionLineItemSetting,
} from "@/lib/api";
import { COST_TYPE_LABEL, LINE_COST_TYPES, type LineCostType } from "@/lib/costPlanMath";
import {
  findSmartSectionTemplate,
  findSmartSectionSettings,
  resolveEffectiveLineItems,
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

  const [lineItems, setLineItems] = useState<SmartSectionLineItemSetting[]>([]);
  const [tunables, setTunables] = useState<Record<string, number>>({});
  const [laborCrew, setLaborCrew] = useState("");
  const [laborDays, setLaborDays] = useState("");

  useEffect(() => {
    if (!open || !template) return;
    setLineItems(resolveEffectiveLineItems(template, settings));
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
        line_items: lineItems.filter((li) => li.name.trim() !== ""),
        tunables,
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
      items.map((li, i) => (i === index ? (cost_type === "material" ? { slot_key: li.slot_key, name: li.name } : { ...li, cost_type }) : li)),
    );
  const removeLineItem = (index: number) => setLineItems((items) => items.filter((_, i) => i !== index));
  const addLineItem = () => setLineItems((items) => [...items, { slot_key: null, name: "" }]);

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
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="flex items-center gap-1.5">
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
                  <button
                    type="button"
                    onClick={() => moveLineItem(i, -1)}
                    disabled={i === 0}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-muted disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLineItem(i, 1)}
                    disabled={i === lineItems.length - 1}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-muted disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLineItem(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
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
                  <div className="grid grid-cols-2 gap-2.5">
                    {group.map((t) => (
                      <div key={t.key} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t.label}</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={tunables[t.key] ?? t.defaultValue}
                            onChange={(e) =>
                              setTunables((v) => ({ ...v, [t.key]: parseFloat(e.target.value) || 0 }))
                            }
                            className="h-9 pr-16"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
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

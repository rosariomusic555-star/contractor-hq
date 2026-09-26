import { useState } from "react";
import type { SmartSectionLaborDefault } from "@/lib/api";
import type { LineCostType } from "@/lib/costPlanMath";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listSmartSectionSettings } from "@/lib/api";
import {
  SMART_SECTION_TEMPLATES,
  findSmartSectionSettings,
  resolveEffectiveLineItems,
} from "@/lib/smartSections";
import { SmartSectionTemplateEditorDialog } from "./SmartSectionTemplateEditorDialog";

/**
 * A single question — "what are you building?" — not a wizard. Picking an
 * option immediately creates the section; there's nothing else to confirm.
 * No math happens here — that's step 2, the per-section calculator. The
 * gear icon opens the same template editor as Settings > Manage Smart
 * Section Templates, for editing this build type's line items/calculator
 * numbers without leaving the flow of building a quote.
 */
export function SmartSectionDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The template's lines (names + cost types, this contractor's version)
   * and its labor default, if any. */
  onCreate: (
    buildTypeId: string,
    label: string,
    lineItems: { name: string; cost_type: LineCostType }[],
    labor: SmartSectionLaborDefault | null,
  ) => void;
}) {
  const [editingBuildType, setEditingBuildType] = useState<string | null>(null);
  const { data: allSettings = [] } = useQuery({
    queryKey: ["smart-section-settings"],
    queryFn: listSmartSectionSettings,
    enabled: open,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>What are you building?</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {SMART_SECTION_TEMPLATES.map((template) => {
              const settings = findSmartSectionSettings(allSettings, template.id);
              const lineItems = resolveEffectiveLineItems(template, settings).map((li) => ({
                name: li.name,
                cost_type: li.cost_type ?? ("material" as const),
              }));
              return (
                <div
                  key={template.id}
                  className="flex w-full items-center gap-1.5 rounded-xl border border-border bg-card p-1.5 pl-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onCreate(template.id, template.label, lineItems, settings?.labor_default ?? null);
                      onOpenChange(false);
                    }}
                    className="flex flex-1 items-center justify-between gap-3"
                  >
                    <span className="text-sm font-semibold text-foreground">{template.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBuildType(template.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Edit ${template.label} template`}
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {editingBuildType && (
        <SmartSectionTemplateEditorDialog
          open={!!editingBuildType}
          onOpenChange={(o) => !o && setEditingBuildType(null)}
          buildTypeId={editingBuildType}
        />
      )}
    </>
  );
}

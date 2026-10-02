import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { SmartSectionTemplateEditorDialog } from "@/components/materials/SmartSectionTemplateEditorDialog";
import { SMART_SECTION_TEMPLATES } from "@/lib/smartSections";
import { BackLink } from "@/components/common/BackLink";
import { useQuery } from "@tanstack/react-query";
import { TypeSetupDialog } from "@/components/projectTypes/TypeSetupDialog";
import { useTypeConfigs } from "@/hooks/use-type-configs";
import { listCategories } from "@/lib/api";

/**
 * The discoverable home for managing Smart Section templates, outside the
 * flow of building a quote. Same editor as the gear icon on the "What are
 * you building?" picker (SmartSectionDialog) — this is just the other
 * entry point into it.
 */
export function SettingsSmartSectionsView() {
  const [editingBuildType, setEditingBuildType] = useState<string | null>(null);
  // Custom project types with a setup (0159) — edited in their own setup
  // (lines, categories, descriptions, calculator), opened from here too.
  const { configs } = useTypeConfigs();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const customTypes = configs
    .map((cfg) => ({ cfg, category: categories.find((c) => c.id === cfg.category_id) }))
    .filter((x): x is { cfg: (typeof configs)[number]; category: NonNullable<(typeof x)["category"]> } => !!x.category);
  const [editingCustom, setEditingCustom] = useState<string | null>(null);
  const editing = customTypes.find((x) => x.cfg.category_id === editingCustom) ?? null;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Smart Section Templates" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">
          Manage Smart Section Templates
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Add, rename or reorder project types in{" "}
        <Link to="/settings/project-types" className="font-semibold text-primary hover:underline">
          Settings › Project types
        </Link>
        .
      </p>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Wand2 className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Build types</span>
        </div>

        <div className="divide-y divide-hairline bg-card">
          {SMART_SECTION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setEditingBuildType(template.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-sm font-semibold text-foreground">{template.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
            </button>
          ))}
        </div>
      </div>

      {customTypes.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border shadow-card">
          <div className="border-b border-hairline bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-subtle">
            Your custom types
          </div>
          <div className="divide-y divide-hairline bg-card">
            {customTypes.map(({ cfg, category }) => (
              <button
                key={cfg.category_id}
                type="button"
                onClick={() => setEditingCustom(cfg.category_id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold text-foreground">{category.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {cfg.line_items.length} line{cfg.line_items.length === 1 ? "" : "s"}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Edit a build type's line items and calculator numbers for your own account — the app's standard
        templates stay available to reset back to any time. Cost plans you've already created
        aren't affected by later edits.
      </p>

      {editing && (
        <TypeSetupDialog
          category={editing.category}
          existing={editing.cfg}
          open={!!editing}
          onOpenChange={(o) => !o && setEditingCustom(null)}
        />
      )}

      {editingBuildType && (
        <SmartSectionTemplateEditorDialog
          open={!!editingBuildType}
          onOpenChange={(o) => !o && setEditingBuildType(null)}
          buildTypeId={editingBuildType}
        />
      )}
    </div>
  );
}

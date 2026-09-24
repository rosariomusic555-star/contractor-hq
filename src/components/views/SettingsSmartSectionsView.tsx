import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Wand2 } from "lucide-react";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { SmartSectionTemplateEditorDialog } from "@/components/materials/SmartSectionTemplateEditorDialog";
import { SMART_SECTION_TEMPLATES } from "@/lib/smartSections";
import { BackLink } from "@/components/common/BackLink";

/**
 * The discoverable home for managing Smart Section templates, outside the
 * flow of building a quote. Same editor as the gear icon on the "What are
 * you building?" picker (SmartSectionDialog) — this is just the other
 * entry point into it.
 */
export function SettingsSmartSectionsView() {
  const [editingBuildType, setEditingBuildType] = useState<string | null>(null);

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

      <p className="text-xs text-muted-foreground">
        Edit a build type's line items and calculator numbers for your own account — the app's standard
        templates stay available to reset back to any time. Materials Sheets you've already created
        aren't affected by later edits.
      </p>

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

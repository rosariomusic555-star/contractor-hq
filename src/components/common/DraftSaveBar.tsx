import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/**
 * Sticky "you have unsaved changes" bar used by the draft-editing screens
 * (Materials sheet, Quote builder, Invoice editor). Sits above the mobile
 * bottom tab bar and clears the desktop sidebar. Render it unconditionally
 * and pass `visible` — it animates nothing, it just un-hides.
 *
 * It also guards leaving the page while visible (useUnsavedChangesGuard):
 * every screen with this bar gets the "Save changes before leaving?" prompt
 * and the browser's own tab-close warning, tied to the same dirty flag.
 */
export function DraftSaveBar({
  visible,
  onDiscard,
  onSave,
  saving,
  label = "Unsaved changes",
}: {
  visible: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
  label?: string;
}) {
  useUnsavedChangesGuard(visible, onSave, onDiscard, saving);
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[68px] z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-4px_hsl(215_23%_15%/0.1)] backdrop-blur md:bottom-0 md:left-64">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <span className="hidden text-sm font-semibold text-muted-foreground sm:block">{label}</span>
        <div className="flex flex-1 gap-2 sm:flex-none">
          <Button
            variant="outline"
            onClick={onDiscard}
            disabled={saving}
            className="flex-1 sm:flex-none"
          >
            <X className="mr-1.5 h-4 w-4" />
            Discard
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="flex-1 font-bold sm:flex-none"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

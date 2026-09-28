import { useEffect, useRef } from "react";
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
 *
 * While it's showing it publishes its height as --draft-bar-h on <html>;
 * AppLayout's <main> adds that to its bottom padding, so the bar never
 * covers the end of the page. Every screen gets this — no per-page padding.
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const token = Symbol("draft-bar");
    const ro = new ResizeObserver(() => {
      barHeights.set(token, el.offsetHeight);
      publishBarHeight();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      barHeights.delete(token);
      publishBarHeight();
    };
  }, [visible]);
  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-[68px] z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-4px_hsl(215_23%_15%/0.1)] backdrop-blur md:bottom-0 md:left-[276px]"
    >
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

/** Heights of the bars showing right now (two can be up at once, e.g. the
 * Measurements card inside a page that has its own). */
const barHeights = new Map<symbol, number>();
function publishBarHeight() {
  const h = Math.max(0, ...barHeights.values());
  if (h > 0) document.documentElement.style.setProperty("--draft-bar-h", `${h}px`);
  else document.documentElement.style.removeProperty("--draft-bar-h");
}

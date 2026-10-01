import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useAutoSavePreference } from "@/hooks/use-auto-save";

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
  count,
  autoSave,
}: {
  visible: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
  label?: string;
  /** How many things changed — "3 unsaved changes" (see draftChanges). */
  count?: number;
  /**
   * Offer auto-save on this screen (the per-user "Auto-save changes"
   * preference, default off). Pass only where saving has no side effects
   * (e.g. not a sent / approved quote — saving reverts it). `key` changes
   * on every edit; the save runs after a short pause in typing.
   */
  autoSave?: { key: unknown };
}) {
  useUnsavedChangesGuard(visible, onSave, onDiscard, saving);
  const [autoOn, setAutoOn] = useAutoSavePreference();
  const auto = !!autoSave && autoOn;
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

  // Auto-save: a quiet moment after the last edit.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (!auto || !visible || saving) return;
    const t = window.setTimeout(() => saveRef.current(), AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [auto, visible, saving, autoSave?.key]);

  if (!visible) return null;
  const text = count && count > 0 ? `${count} unsaved ${count === 1 ? "change" : "changes"}` : label;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Unsaved changes"
      className="fixed inset-x-0 bottom-[68px] z-40 bg-foreground px-4 py-3 text-background shadow-[0_-6px_20px_-6px_hsl(215_23%_15%/0.45)] md:bottom-0 md:left-[276px]"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
          </span>
          {saving ? (auto ? "Auto-saving…" : "Saving…") : text}
        </span>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          {autoSave && (
            <label className="mr-1 flex items-center gap-2 text-xs font-semibold text-background/80">
              <Switch checked={autoOn} onCheckedChange={setAutoOn} aria-label="Auto-save changes" className="data-[state=unchecked]:bg-background/30" />
              Auto-save
            </label>
          )}
          <Button
            variant="ghost"
            onClick={onDiscard}
            disabled={saving}
            className="flex-1 text-background hover:bg-background/15 hover:text-background sm:flex-none"
          >
            <X className="mr-1.5 h-4 w-4" />
            Discard
          </Button>
          <Button onClick={onSave} disabled={saving} className="h-11 flex-1 px-6 text-base font-extrabold sm:flex-none">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Pause after the last edit before auto-save runs. */
const AUTO_SAVE_DELAY_MS = 2500;

/** Heights of the bars showing right now (two can be up at once, e.g. the
 * Measurements card inside a page that has its own). */
const barHeights = new Map<symbol, number>();
function publishBarHeight() {
  const h = Math.max(0, ...barHeights.values());
  if (h > 0) document.documentElement.style.setProperty("--draft-bar-h", `${h}px`);
  else document.documentElement.style.removeProperty("--draft-bar-h");
}

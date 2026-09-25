import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";

/**
 * The one sticky bar at the bottom of a builder (Quote, Invoice, Materials
 * sheet).
 *
 * Desktop: exactly the existing DraftSaveBar — only while there are unsaved
 * changes.
 *
 * Phones: always there, slim, just above the tab bar: the key figure on the
 * left (tap it → bottom sheet with the full breakdown) and ONE action on the
 * right — Discard/Save while dirty, else the builder's primary action.
 * While it's showing, `data-action-bar` on <body> lifts the floating AI /
 * create buttons above it and pads the page + focus scrolling so nothing
 * (including a focused field with the keyboard open) hides behind it.
 */
export function BuilderActionBar({
  isDirty,
  saving,
  onSave,
  onDiscard,
  figureLabel,
  figure,
  breakdownTitle,
  breakdown,
  primaryAction,
}: {
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  figureLabel: string;
  figure: ReactNode;
  breakdownTitle: string;
  breakdown: ReactNode;
  /** Shown when there's nothing to save. Omit for none. */
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    document.body.dataset.actionBar = "on";
    return () => {
      delete document.body.dataset.actionBar;
    };
  }, [isMobile]);

  if (!isMobile) {
    return <DraftSaveBar visible={isDirty} onDiscard={onDiscard} onSave={onSave} saving={saving} />;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(3.75rem+max(env(safe-area-inset-bottom),0.5rem))] z-40 border-t border-border bg-card/95 px-4 py-2 shadow-[0_-4px_16px_-4px_hsl(215_23%_15%/0.12)] backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl text-left"
            aria-label={`${figureLabel} — show breakdown`}
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                {isDirty ? "Unsaved changes" : figureLabel}
              </span>
              <span className="block truncate text-lg font-extrabold leading-tight tabular-nums text-foreground">{figure}</span>
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          {isDirty ? (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={onDiscard} disabled={saving} className="h-11 w-11 p-0" aria-label="Discard changes">
                <X className="h-4 w-4" />
              </Button>
              <Button onClick={onSave} disabled={saving} className="h-11 px-5 font-bold">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className={cn("h-11 max-w-[55%] shrink-0 truncate px-5 font-bold")}
              >
                {primaryAction.label}
              </Button>
            )
          )}
        </div>
      </div>
      <BottomSheet open={open} onOpenChange={setOpen} title={breakdownTitle}>
        {breakdown}
      </BottomSheet>
    </>
  );
}

/** One line of a totals breakdown sheet. */
export function BreakdownRow({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: "positive" | "negative" }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-0", strong && "text-base font-extrabold")}>
      <span className={cn("text-sm", strong ? "font-bold text-foreground" : "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-lg" : "text-sm font-semibold",
          tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

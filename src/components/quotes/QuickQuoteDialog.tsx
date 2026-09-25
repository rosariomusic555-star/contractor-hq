import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUILD_TYPES } from "@/lib/buildTypes";
import { findQuickQuoteTemplate } from "@/lib/quickQuote";
import { MOBILE_BOTTOM_SHEET } from "@/lib/dialogStyles";
import { cn } from "@/lib/utils";

/**
 * A single question — "what are you building?" — same taxonomy as the
 * Materials Sheet's Smart Section, but this is Quick Quote's own picker:
 * picking a build type opens the quick-question form, never the Smart
 * Section flow.
 */
export function QuickQuoteDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (buildTypeId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-sm gap-4", MOBILE_BOTTOM_SHEET)}>
        <DialogHeader>
          <DialogTitle>What are you building?</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {BUILD_TYPES.filter((b) => findQuickQuoteTemplate(b.id)).map((buildType) => (
            <button
              key={buildType.id}
              type="button"
              onClick={() => onPick(buildType.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-sm font-semibold text-foreground">{buildType.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

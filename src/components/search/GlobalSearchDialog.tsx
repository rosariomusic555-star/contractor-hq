import { useEffect, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { Command, CommandInput } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { SearchResults } from "./SearchResults";
import { useSearchModel } from "./use-search-model";

/**
 * The original global search dialog (⌘K palette with Recent + quick
 * actions). No longer mounted — search is the inline sidebar box
 * (SidebarSearch) and the phone search page (MobileSearchSheet) — kept for
 * reuse. Results come from the shared SearchResults / useSearchModel.
 */
function GlobalSearchDialogInner({ open, onOpenChange, onNewOpportunity }: { open: boolean; onOpenChange: (open: boolean) => void; onNewOpportunity: () => void }) {
  const isMobile = useIsMobile();
  const [input, setInput] = useState("");
  useEffect(() => {
    if (!open) setInput("");
  }, [open]);
  const model = useSearchModel({ input, active: open, idle: "full", onDone: () => onOpenChange(false) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0",
          isMobile
            ? "left-0 top-0 h-[100dvh] max-w-none translate-x-0 translate-y-0 rounded-none border-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0"
            : "top-[15vh] max-w-[640px] translate-y-0 rounded-card data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0",
        )}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Find clients, projects, opportunities, quotes, invoices, change orders and pages.</DialogDescription>
        <Command shouldFilter={false} loop value={model.selected} onValueChange={model.setSelected} className="rounded-none bg-card">
          <CommandInput
            value={input}
            onValueChange={setInput}
            autoFocus
            placeholder={isMobile ? "Search…" : "Search clients, projects, quotes, invoices…"}
            className="h-14 pr-8 text-base"
          />
          <SearchResults model={model} onNewOpportunity={onNewOpportunity} className={isMobile ? "max-h-none flex-1" : "max-h-[min(60vh,520px)]"} />
          {!isMobile && (
            <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 text-[11px] text-muted-foreground">
              <span>↑↓ to move</span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" aria-hidden /> to open
              </span>
              <span>Esc to close</span>
            </div>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const GlobalSearchDialog = withErrorBoundary(GlobalSearchDialogInner, "GlobalSearchDialog");

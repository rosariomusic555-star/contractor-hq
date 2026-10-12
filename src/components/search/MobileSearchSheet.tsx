import { useEffect, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Search, X } from "lucide-react";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";
import { SearchResults } from "./SearchResults";
import { useSearchModel } from "./use-search-model";

/**
 * Phone search: a full-screen page with the input at the top (already
 * focused, keyboard up) and the results listed under it. An empty box shows
 * Recent.
 */
function MobileSearchSheetInner({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  useEffect(() => {
    if (!open) setInput("");
  }, [open]);
  const model = useSearchModel({ input, active: open, idle: "recent", onDone: () => onOpenChange(false) });

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-card outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4"
        >
          <SheetPrimitive.Title className="sr-only">Search</SheetPrimitive.Title>
          <SheetPrimitive.Description className="sr-only">Find clients, projects, opportunities, quotes, invoices, change orders and pages.</SheetPrimitive.Description>
          <CommandPrimitive shouldFilter={false} loop vimBindings={false} value={model.selected} onValueChange={model.setSelected} label="Search" className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1 border-b border-border px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <SheetPrimitive.Close className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted" aria-label="Close search">
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </SheetPrimitive.Close>
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-muted px-3 text-muted-foreground">
                <Search className="h-4 w-4 flex-none" aria-hidden />
                <CommandPrimitive.Input
                  ref={inputRef}
                  value={input}
                  onValueChange={setInput}
                  placeholder="Search…"
                  aria-label="Search"
                  enterKeyHint="search"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
                {input && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setInput("");
                      inputRef.current?.focus();
                    }}
                    className="-mr-1 flex h-8 w-8 flex-none items-center justify-center rounded-md hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <SearchResults model={model} className="max-h-none min-h-0 flex-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
          </CommandPrimitive>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

export const MobileSearchSheet = withErrorBoundary(MobileSearchSheetInner, "MobileSearchSheet");

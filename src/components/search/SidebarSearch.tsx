import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover";
import { Search, X } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SearchResults } from "./SearchResults";
import { searchShortcutLabel, useGlobalSearch } from "./search-context";
import { useSearchModel } from "./use-search-model";

/**
 * The sidebar's search box — a real input you type into, with the results
 * in a dropdown under it (460px, over the page). Focus never leaves the
 * input: ↑/↓ move the highlighted row (cmdk, aria-activedescendant), Enter
 * opens it, Esc clears the text and then blurs. An empty box shows nothing;
 * ↓ in an empty box shows Recent.
 *
 * `raised`: a solid white field with a hairline border and a light shadow,
 * for the sidebar header that sits over the page banner or white alike.
 */
export function SidebarSearch({ raised = false }: { raised?: boolean }) {
  const search = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const location = useLocation();

  const reset = () => {
    setInput("");
    setShowRecent(false);
    inputRef.current?.blur();
  };
  const model = useSearchModel({ input, active: focused, idle: showRecent ? "recent" : "none", onDone: reset });
  const open = focused && (model.searching || model.hasContent);

  // ⌘K / Ctrl+K / "/" land here (while the sidebar is showing).
  const register = search?.registerSidebarInput;
  useEffect(() => {
    if (!register) return;
    register(() => {
      const el = inputRef.current;
      if (!el || el.getClientRects().length === 0) return false;
      el.focus();
      el.select();
      return true;
    });
    return () => register(null);
  }, [register]);

  // Navigating away (any way) closes it.
  useEffect(() => {
    setInput("");
    setShowRecent(false);
    inputRef.current?.blur();
  }, [location.pathname, location.search]);

  if (!search) return null;
  const shortcut = searchShortcutLabel();

  return (
    <CommandPrimitive shouldFilter={false} loop vimBindings={false} value={model.selected} onValueChange={model.setSelected} label="Search">
      <Popover open={open}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex h-[38px] w-full items-center gap-[10px] rounded-[10px] border px-[11px] text-sm text-muted-foreground transition-colors",
              focused
                ? "border-ring/40 bg-card ring-2 ring-ring"
                : raised
                  ? "border-border bg-card shadow-sm hover:border-muted-subtle/40"
                  : "border-transparent bg-muted hover:bg-muted/70",
            )}
            onMouseDown={(e) => {
              // Clicking the field's padding / icon focuses the input too.
              if (e.target !== inputRef.current) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
          >
            <Search className="h-4 w-4 flex-none" aria-hidden />
            <CommandPrimitive.Input
              ref={inputRef}
              value={input}
              onValueChange={(v) => {
                setInput(v);
                setShowRecent(false);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setShowRecent(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (input || showRecent) {
                    setInput("");
                    setShowRecent(false);
                  } else inputRef.current?.blur();
                } else if (e.key === "ArrowDown" && !input && !showRecent) {
                  setShowRecent(true);
                }
              }}
              placeholder="Search…"
              aria-label="Search"
              aria-keyshortcuts={shortcut === "⌘K" ? "Meta+K" : "Control+K"}
              className={cn(
                "h-full min-w-0 flex-1 bg-transparent outline-none",
                "text-foreground placeholder:text-muted-foreground",
              )}
            />
            {input ? (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setInput("");
                  inputRef.current?.focus();
                }}
                className={cn(
                  "-mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-md",
                  "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : (
              !focused && (
                <kbd className={cn("rounded px-1.5 py-px font-sans text-[11px] font-medium", raised ? "border border-border bg-muted text-muted-foreground" : "border border-border bg-card text-muted-foreground")}>
                  {shortcut}
                </kbd>
              )
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Keep the cursor in the input: no focus moves, and clicks in the
          // panel don't blur it.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className="z-[60] w-[460px] max-w-[calc(100vw-24px)] overflow-hidden rounded-card border-border bg-card p-0 shadow-lg data-[state=open]:zoom-in-100 data-[side=bottom]:slide-in-from-top-1"
        >
          <SearchResults model={model} className="max-h-[70vh]" />
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  );
}

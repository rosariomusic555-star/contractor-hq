import { useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { BottomSheet, SheetRow } from "./BottomSheet";

export interface ActionMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

/**
 * The "⋯" menu for a row's secondary controls (reorder, Price Book,
 * tracking, delete…) on phones: a 44×44px trigger that opens a bottom
 * sheet. Renders nothing from md up, where the same controls are inline.
 */
export function ActionMenu({
  items,
  title,
  ariaLabel = "More actions",
  tone = "light",
  className,
}: {
  items: ActionMenuItem[];
  /** Bottom sheet heading on phones. */
  title: string;
  ariaLabel?: string;
  /** "dark" for the slate section headers. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerClass = cn(
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
    tone === "dark" ? "text-background/80 hover:bg-white/10 hover:text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    className,
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label={ariaLabel}
          className={triggerClass}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <BottomSheet open={open} onOpenChange={setOpen} title={title}>
          <div className="space-y-0.5">
            {items.map((item) => (
              <div key={item.label}>
                {item.separatorBefore && <div className="my-1.5 border-t border-hairline" />}
                <SheetRow
                  destructive={item.destructive}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon && <item.icon className="h-5 w-5 shrink-0 opacity-80" />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </SheetRow>
              </div>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  // Phones only — on desktop every caller shows its controls inline, so
  // there's nothing to render (and no hidden Radix menu to mount).
  return null;
}

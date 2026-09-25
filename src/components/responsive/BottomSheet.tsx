import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * The app's phone bottom sheet (vaul Drawer): pickers, "⋯" menus and the
 * builders' totals breakdown all open as one of these on mobile. Scrolls
 * inside itself (max 85% of the screen) and pads for the home indicator.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className={cn("max-h-[85dvh]", className)}>
        <DrawerHeader className="px-4 pb-2 pt-3 text-left">
          <DrawerTitle className="text-base font-bold">{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

/** A full-width, 48px-tall row for lists inside a BottomSheet. */
export function SheetRow({
  children,
  onClick,
  selected,
  destructive,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base transition-colors active:bg-muted disabled:opacity-40",
        selected ? "bg-primary/10 font-semibold text-foreground" : "text-foreground hover:bg-muted/60",
        destructive && "text-destructive",
        className,
      )}
    >
      {children}
    </button>
  );
}

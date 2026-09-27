import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { HeadsUpStep } from "./HeadsUpStep";
import type { HeadsUpTarget } from "./rainDelayContext";

/** The heads-up step on its own (resumed from the Schedule card reminder, a
 * manual date change, or "Confirm start date") — a bottom sheet on phones. */
export function HeadsUpSheet({ open, onOpenChange, target }: { open: boolean; onOpenChange: (o: boolean) => void; target: HeadsUpTarget }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[92vh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle>Send schedule update</SheetTitle>
          <SheetDescription>Opens in your own Messages or Mail app, ready to send.</SheetDescription>
        </SheetHeader>
        <HeadsUpStep scope={target} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

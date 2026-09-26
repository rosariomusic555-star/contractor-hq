import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { COST_TYPE_LABEL, type LineCostType } from "@/lib/costPlanMath";

const OTHER_TYPES: Exclude<LineCostType, "material">[] = ["subcontractor", "equipment", "other"];

/**
 * A Cost plan section's add button: "+ Material" is the main action; the
 * ▾ half offers + Subcontractor / + Equipment / + Other — a popover on
 * desktop, a bottom sheet on phones.
 */
export function AddLineSplitButton({ onAdd }: { onAdd: (type: LineCostType) => void }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const pick = (type: LineCostType) => {
    setOpen(false);
    onAdd(type);
  };

  const options = (
    <div className="space-y-1">
      {OTHER_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => pick(t)}
          className="flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-foreground hover:bg-muted md:min-h-10"
        >
          <Plus className="h-4 w-4 text-primary" />
          {COST_TYPE_LABEL[t]}
        </button>
      ))}
    </div>
  );

  const toggle = (
    <button
      type="button"
      aria-label="Add another kind of line"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className="flex h-[52px] w-14 shrink-0 items-center justify-center border-l-[1.5px] border-primary/30 text-primary transition-colors hover:bg-primary/10"
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  );

  return (
    <div className="mt-3 flex w-full overflow-hidden rounded-2xl border-[1.5px] border-primary/40 bg-primary/5">
      <button
        type="button"
        onClick={() => onAdd("material")}
        className="flex h-[52px] flex-1 items-center justify-center gap-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        Material
      </button>
      {isMobile ? (
        <>
          {toggle}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
              <SheetHeader className="text-left">
                <SheetTitle>Add a line</SheetTitle>
              </SheetHeader>
              <div className="mt-3">{options}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{toggle}</PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1.5">
            {options}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SMART_SECTION_TEMPLATES } from "@/lib/smartSectionTemplates";

/**
 * A single question — "what are you building?" — not a wizard. Picking an
 * option immediately creates the section; there's nothing else to confirm.
 */
export function SmartSectionDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (label: string, lineItems: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>What are you building?</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {SMART_SECTION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                onCreate(template.label, template.lineItems);
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-sm font-semibold text-foreground">{template.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

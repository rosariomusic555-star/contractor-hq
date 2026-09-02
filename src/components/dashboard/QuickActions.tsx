import { Plus, FileText, Receipt, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  onCreateQuote: () => void;
  onCreateInvoice: () => void;
}

export function QuickActions({ onCreateQuote, onCreateInvoice }: QuickActionsProps) {
  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        <Button 
          onClick={onCreateQuote}
          className="h-auto py-4 flex flex-col items-center gap-2 bg-primary hover:bg-primary/90"
        >
          <div className="p-2 rounded-lg bg-primary-foreground/10">
            <FileText className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">New Quote</span>
        </Button>
        <Button 
          onClick={onCreateInvoice}
          className="h-auto py-4 flex flex-col items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <div className="p-2 rounded-lg bg-accent-foreground/10">
            <Receipt className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">New Invoice</span>
        </Button>
        <Button 
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2 col-span-2"
        >
          <div className="p-2 rounded-lg bg-muted">
            <UserPlus className="w-5 h-5 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium">Add Client</span>
        </Button>
      </div>
    </div>
  );
}

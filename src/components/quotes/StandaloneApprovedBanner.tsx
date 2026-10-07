import { CalendarDays, FileText, FolderPlus, Layers, Repeat2, Send, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECT_ACTION_LABEL, type ProjectAction } from "@/lib/standaloneQuote";

const ACTION_ICON: Record<ProjectAction, typeof Send> = {
  deposit: Send,
  invoice: FileText,
  payment: Wallet,
  change_order: Repeat2,
  schedule: CalendarDays,
  cost_plan: Layers,
};

/**
 * On an approved standalone quote: it's a dead end until it's in a project.
 * Stays until it is. The job's next steps stay visible — each opens the
 * Create project modal first, then carries on to that step.
 */
export function StandaloneApprovedBanner({
  hasDeposit,
  onCreateProject,
}: {
  hasDeposit: boolean;
  onCreateProject: (then: ProjectAction | null) => void;
}) {
  const actions: ProjectAction[] = [...(hasDeposit ? (["deposit"] as const) : []), "invoice", "payment", "change_order", "schedule", "cost_plan"];
  return (
    <div className="rounded-card border border-warning/40 bg-warning/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Approved, but not in a project yet.</p>
          <p className="text-sm text-muted-foreground">Create a project to invoice and track it.</p>
        </div>
        <Button onClick={() => onCreateProject(null)} className="h-11 w-full font-bold sm:h-10 sm:w-auto">
          <FolderPlus className="mr-1.5 h-4 w-4" />
          Create project
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-warning/30 pt-3">
        {actions.map((a) => {
          const Icon = ACTION_ICON[a];
          return (
            <Button key={a} variant="outline" size="sm" onClick={() => onCreateProject(a)} className="bg-card font-semibold">
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {PROJECT_ACTION_LABEL[a]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

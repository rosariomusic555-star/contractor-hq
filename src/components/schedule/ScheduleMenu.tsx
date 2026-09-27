import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defaultDelayDay } from "@/lib/scheduleShift";
import { useToast } from "@/hooks/use-toast";
import { createStartConfirmation, getProject } from "@/lib/api";
import { useHeadsUp, useRainDelay } from "./rainDelayContext";

/** "⋯" on a scheduled job — delay it for any reason, not just flagged
 * weather (0120). Owners only. */
export function ScheduleMenu({ projectId, start, end }: { projectId: string; start: string | null; end: string | null }) {
  const openDelay = useRainDelay();
  const openHeadsUp = useHeadsUp();
  const { toast } = useToast();
  if (!openDelay || !start) return null;
  // Client heads-up (0121): a "Start date confirmed" message.
  const confirmStart = async () => {
    try {
      const project = await getProject(projectId);
      if (!project.client_id) return toast({ title: "This job has no client", description: "Add a client to send them updates." });
      const u = await createStartConfirmation(project);
      openHeadsUp?.({ ids: [u.id] });
    } catch (err) {
      toast({ title: "Couldn't start that", description: (err as Error).message, variant: "destructive" });
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Schedule actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openDelay({ projectId, date: defaultDelayDay(start, end), reason: "rain" })}>Delay job…</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void confirmStart()}>Confirm start date with client…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

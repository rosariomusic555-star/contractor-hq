import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defaultDelayDay } from "@/lib/scheduleShift";
import { useRainDelay } from "./rainDelayContext";

/** "⋯" on a scheduled job — delay it for any reason, not just flagged
 * weather (0120). Owners only. */
export function ScheduleMenu({ projectId, start, end }: { projectId: string; start: string | null; end: string | null }) {
  const openDelay = useRainDelay();
  if (!openDelay || !start) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Schedule actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openDelay({ projectId, date: defaultDelayDay(start, end), reason: "rain" })}>Delay job…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

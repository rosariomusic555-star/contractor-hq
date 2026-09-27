import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * After a delay is applied: "Let affected clients know". Placeholder for the
 * next feature (the client heads-up message) — it lists each affected job's
 * client and will get the delay id to build the message from. Nothing is
 * sent from here yet.
 */
export function ClientHeadsUpStep({
  delayId: _delayId,
  clients,
  onDone,
}: {
  delayId: string;
  clients: { projectId: string; projectName: string; clientName: string | null }[];
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 px-5 py-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <MessageSquare className="h-4 w-4" /> Let affected clients know
        </h3>
        <p className="text-xs text-muted-foreground">Sending a heads-up from here is coming next. For now, here's who's affected.</p>
        <ul className="divide-y divide-hairline rounded-xl border border-border">
          {clients.map((c) => (
            <li key={c.projectId} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{c.clientName ?? "No client"}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.projectName}</span>
              </span>
              <Link to={`/projects/${c.projectId}`} onClick={onDone} className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80">
                Open job
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="sticky bottom-0 border-t border-hairline bg-background px-5 py-3">
        <Button className="h-11 w-full font-bold" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

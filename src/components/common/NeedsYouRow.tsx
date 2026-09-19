import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NeedsYouItem, NeedsYouTone } from "@/lib/needsYou";

const toneChip: Record<NeedsYouTone, string> = {
  red: "bg-destructive/15 text-destructive",
  grey: "bg-muted text-muted-foreground",
  green: "bg-success/15 text-success",
};

const toneIcon: Record<NeedsYouTone, typeof AlertCircle> = {
  red: AlertCircle,
  grey: FileText,
  green: CheckCircle2,
};

/** One row of the "Needs you" queue — shared by the Dashboard card
 * (capped) and the full /needs-you list (uncapped) so they render
 * identically. */
export function NeedsYouRow({ item }: { item: NeedsYouItem }) {
  const Icon = toneIcon[item.tone];
  return (
    <Link
      to={item.href}
      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneChip[item.tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">
        {item.action}
      </span>
    </Link>
  );
}

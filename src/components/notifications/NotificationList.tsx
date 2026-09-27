import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, ClipboardCheck, MessageSquare, CloudRain, Eye, ListChecks, Star, XCircle, Bell, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/api";
import { timeAgoShort } from "@/lib/quoteActivity";

const ICON: Record<string, typeof Bell> = {
  quote_first_open: Eye,
  quote_viewed_again: Eye,
  quote_selections: ListChecks,
  quote_approved: CheckCircle2,
  quote_declined: XCircle,
  weather_risk: CloudRain,
  review_eligible: Star,
  review_clicked: Star,
  precon_overdue: ClipboardCheck,
  precon_ready: ClipboardCheck,
  precon_locate_expiring: ClipboardCheck,
  maintenance_due: Wrench,
  maintenance_request: Wrench,
  progress_review: Camera,
  progress_comment: MessageSquare,
};

/** The notification rows — tap one to open its quote (and mark it read). */
export function NotificationList({
  notifications,
  onOpen,
  compact = false,
}: {
  notifications: AppNotification[];
  onOpen: (n: AppNotification) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  if (!notifications.length) return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet — we'll let you know when a client opens a quote or weather threatens a work day.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {notifications.map((n) => {
        const Icon = ICON[n.kind] ?? Bell;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(n);
                if (n.link) navigate(n.link);
              }}
              className={cn("flex w-full items-start gap-2.5 px-3 text-left hover:bg-muted/50", compact ? "py-2.5" : "py-3", !n.read_at && "bg-info/5")}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", n.kind === "quote_declined" ? "text-destructive" : n.kind === "weather_risk" || n.kind.startsWith("review_") || n.kind.startsWith("precon_") ? "text-warning" : n.kind === "quote_approved" ? "text-success" : "text-info")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm text-foreground [overflow-wrap:anywhere]", !n.read_at && "font-semibold")}>{n.title}</span>
                {n.body && <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{n.body}</span>}
                <span className="block text-[11px] text-muted-subtle">{timeAgoShort(n.created_at)}</span>
              </span>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info" aria-label="Unread" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

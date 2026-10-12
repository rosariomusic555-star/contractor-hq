import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "./NotificationList";
import { cn } from "@/lib/utils";

function UnreadBadge({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {unread > 9 ? "9+" : unread}
    </span>
  );
}

/** Desktop bell (sidebar header): unread count + the latest notifications.
 *  `onSlate`: white icon over the page banner. `twin`: a look-only copy (see
 *  SidebarCompany) that mirrors the real bell's hover / focus. */
export function NotificationsBell({ onSlate = false, twin = false }: { onSlate?: boolean; twin?: boolean }) {
  const { notifications, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const bell = "relative ml-auto flex h-9 w-9 items-center justify-center rounded-lg";
  if (twin) {
    return (
      <div
        className={cn(
          bell,
          onSlate ? "text-white/80" : "text-muted-foreground",
          "group-has-[.chq-bell:hover]/hdr:bg-white/10 group-has-[.chq-bell:hover]/hdr:text-white group-has-[.chq-bell:focus-visible]/hdr:ring-2 group-has-[.chq-bell:focus-visible]/hdr:ring-white/70",
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        <UnreadBadge unread={unread} />
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            bell,
            "chq-bell transition-colors",
            onSlate ? "text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70" : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          <UnreadBadge unread={unread} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <span className="text-sm font-bold text-foreground">Notifications</span>
          {unread > 0 && (
            <button type="button" onClick={() => markRead()} className="text-xs font-semibold text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <NotificationList
            compact
            notifications={notifications.slice(0, 12)}
            onOpen={(n) => {
              if (!n.read_at) markRead([n.id]);
              setOpen(false);
            }}
          />
        </div>
        <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-hairline px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-muted/50">
          See all
        </Link>
      </PopoverContent>
    </Popover>
  );
}

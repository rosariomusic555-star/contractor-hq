import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "./NotificationList";

/** Desktop bell (sidebar header): unread count + the latest notifications. */
export function NotificationsBell() {
  const { notifications, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
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

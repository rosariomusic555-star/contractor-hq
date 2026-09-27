import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationList } from "@/components/notifications/NotificationList";

/** All notifications (0117) — the phone's way in (More › Notifications). */
export function NotificationsView() {
  const { notifications, unread, markRead } = useNotifications();
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-4">
      <MobilePageHeader title="Notifications" />
      <div className="hidden md:block">
        <PageHeader title="Notifications" />
      </div>
      {unread > 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => markRead()}>
            Mark all read
          </Button>
        </div>
      )}
      <div className="card-surface overflow-hidden p-0">
        <NotificationList notifications={notifications} onOpen={(n) => !n.read_at && markRead([n.id])} />
      </div>
    </div>
  );
}

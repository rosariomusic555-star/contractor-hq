import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markNotificationsRead } from "@/lib/api";

/** In-app notifications (0117) — polled every minute while the app is open. */
export function useNotifications() {
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(40),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = notifications.filter((n) => !n.read_at).length;
  return { notifications, unread, markRead: (ids?: string[]) => markRead.mutate(ids) };
}

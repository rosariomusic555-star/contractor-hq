import { useQuery } from "@tanstack/react-query";
import { getSignedImageUrls } from "@/lib/api";
import { useMyName, useUserProfile } from "@/hooks/use-my-name";
import { cn } from "@/lib/utils";

/** The signed-in person's photo (My profile), else their initials. */
export function UserAvatar({ className }: { className?: string }) {
  const me = useMyName();
  const { data: profile } = useUserProfile();
  const path = profile && profile !== "missing" ? profile.avatar_path : null;
  const { data: urls } = useQuery({ queryKey: ["signed-image", path], queryFn: () => getSignedImageUrls([path!]), enabled: !!path, staleTime: 30 * 60_000 });
  const src = path ? urls?.[path] : undefined;
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-foreground">{me.initials}</span>}
    </span>
  );
}

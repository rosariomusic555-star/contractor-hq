import { Outlet } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { usePortalAuth } from "@/lib/portalAuth";
import { PortalSignIn } from "./PortalSignIn";
import { useHubLayout } from "@/hooks/use-hub-layout";
import { cn } from "@/lib/utils";

/**
 * The Client Hub's own shell — no contractor chrome (no Sidebar, no
 * BottomTabBar, no Dashboard/Settings nav), gated on the portal's own
 * session (usePortalAuth, backed by portalSupabase — never the
 * contractor's own auth). Mirrors AppLayout's own convention: no session
 * renders the sign-in screen in place, at whatever URL, rather than a
 * redirect — so a signed-out client following a deep link into the hub
 * ends up right back on it once they sign in.
 */
export function PortalLayout() {
  const { session, loading, signOut } = usePortalAuth();
  // Desktop layout (default "new"): phones keep the exact same column; md and
  // up get a wider page on a soft neutral background.
  const wideLayout = useHubLayout() === "new";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
      </div>
    );
  }

  if (!session) {
    return <PortalSignIn />;
  }

  return (
    <div className={cn("min-h-screen bg-background", wideLayout && "md:bg-muted/40")}>
      <header className="no-print border-b border-hairline bg-card px-4 py-3.5">
        <div className={cn("flex items-center justify-between", wideLayout && "mx-auto md:max-w-3xl lg:max-w-[1180px]")}>
          <span className="text-[15px] font-bold text-foreground">Client Hub</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>
      <main className={cn("mx-auto max-w-lg px-4 py-6", wideLayout && "md:max-w-3xl md:py-8 lg:max-w-[1180px]")}>
        <Outlet />
      </main>
    </div>
  );
}

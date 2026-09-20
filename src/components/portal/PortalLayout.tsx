import { Outlet } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { usePortalAuth } from "@/lib/portalAuth";
import { PortalSignIn } from "./PortalSignIn";

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
    <div className="min-h-screen bg-background">
      <header className="no-print flex items-center justify-between border-b border-hairline bg-card px-4 py-3.5">
        <span className="text-[15px] font-bold text-foreground">Client Hub</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

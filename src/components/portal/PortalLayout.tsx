import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PORTAL_CONFIRM_PATH, initialPortalLink } from "@/lib/portalLinks";
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
  const location = useLocation();
  // Only the page load that came from an expired link shows its notice —
  // not a later sign-out in the same visit.
  const [landingError, setLandingError] = useState(initialPortalLink.kind === "error");
  useEffect(() => {
    if (session) setLandingError(false);
  }, [session]);
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

  // A sign-in link that points at /portal itself (template / redirect set
  // up differently) — hand it to the confirm page rather than dropping it.
  const params = new URLSearchParams(location.search);
  if (params.has("token_hash") || params.has("code")) {
    return <Navigate to={`${PORTAL_CONFIRM_PATH}${location.search}`} replace />;
  }

  if (!session) {
    // An expired / already-used link lands here as #error_code=otp_expired:
    // say so, instead of a plain sign-in form the client would loop on.
    return landingError && initialPortalLink.kind === "error" ? (
      <PortalSignIn
        initialEmail={initialPortalLink.email ?? ""}
        notice="This sign-in link has expired or was already used. Send yourself a new one below."
      />
    ) : (
      <PortalSignIn />
    );
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

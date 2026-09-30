import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalSupabase } from "@/lib/portalSupabase";
import { usePortalAuth } from "@/lib/portalAuth";
import { initialPortalLink, parsePortalLink } from "@/lib/portalLinks";
import { PortalSignIn } from "./PortalSignIn";

/**
 * Where every Client Hub sign-in link lands (/portal/auth/confirm).
 *
 * A token_hash link is verified only when the client taps "Continue" —
 * email security scanners that prefetch links load this page but never
 * click, so they can't use the one-time token up. verifyOtp needs nothing
 * stored in this browser, so the link works on any device or email app.
 * Expired / used links (and anything that fails) get a friendly "send a
 * new one" with the email filled in — never a silent loop back to the
 * sign-in form.
 */
export function PortalAuthConfirm() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = usePortalAuth();
  // The hash may already be cleared by supabase-js; fall back to the
  // snapshot taken at page load.
  const live = parsePortalLink(location.search, location.hash);
  const link = live.kind === "none" && initialPortalLink.kind !== "none" ? initialPortalLink : live;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(link.kind === "error");

  // An older #access_token link: supabase-js signs in on its own; just go.
  useEffect(() => {
    if (link.kind === "implicit" && session) navigate("/portal", { replace: true });
  }, [link.kind, session, navigate]);

  const email = "email" in link ? link.email : null;

  if (failed) {
    return (
      <PortalSignIn
        initialEmail={email ?? ""}
        notice="This sign-in link has expired or was already used. Send yourself a new one below."
      />
    );
  }

  if (loading) return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-subtle" /></Centered>;

  if (link.kind === "none" || (link.kind === "implicit" && !session)) {
    // Nothing to verify (or an old link that didn't sign in): signed in →
    // the Hub; otherwise the regular sign-in, explained.
    if (session) return <Navigate to="/portal" replace />;
    return link.kind === "implicit" ? (
      <PortalSignIn notice="That sign-in link didn't work. Send yourself a new one below." />
    ) : (
      <Navigate to="/portal" replace />
    );
  }
  if (link.kind === "implicit") return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-subtle" /></Centered>;

  const verify = async () => {
    setBusy(true);
    // A different client may be signed in on this device — the link decides who this is.
    if (session) await portalSupabase.auth.signOut({ scope: "local" });
    const { error } =
      link.kind === "token_hash"
        ? await portalSupabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
        : await portalSupabase.auth.exchangeCodeForSession(link.code);
    setBusy(false);
    if (error) setFailed(true);
    else navigate("/portal", { replace: true });
  };

  return (
    <Centered>
      <div className="w-full max-w-xs space-y-5 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LogIn className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">Welcome to your Client Hub</h1>
          <p className="text-sm text-muted-foreground">
            {email ? (
              <>
                Signing in as <span className="font-semibold text-foreground">{email}</span>.
              </>
            ) : (
              "Your project, quotes, invoices and updates in one place."
            )}
          </p>
        </div>
        <Button className="h-12 w-full text-base font-bold" onClick={() => void verify()} disabled={busy} autoFocus>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Signing you in…" : "Continue to your project"}
        </Button>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center px-6">{children}</div>;
}

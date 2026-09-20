import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { portalSupabase } from "./portalSupabase";

interface PortalAuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | undefined>(undefined);

/**
 * Session state for the Client Hub — deliberately its own context, not an
 * extension of src/lib/auth.tsx's AuthProvider. That provider is wired
 * tightly to the contractor's own supabase client and password auth; this
 * one is backed by portalSupabase (magic-link only, separate storage), so
 * there's no shared state to accidentally leak between a client session and
 * a contractor session in the same browser.
 */
export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    portalSupabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = portalSupabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: PortalAuthContextValue = {
    session,
    loading,
    signOut: async () => {
      await portalSupabase.auth.signOut();
    },
  };

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthContextValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within <PortalAuthProvider>");
  return ctx;
}

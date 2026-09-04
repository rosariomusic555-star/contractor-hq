import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, AuthError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const prevUserId = useRef<string | null>(null);
  // Guards the very first session resolution: at that point prevUserId.current
  // is just the ref's default, not a real "previous" identity, so it must
  // never be treated as a change. Otherwise any page whose data query is
  // still in flight on first load (e.g. a public /quote/:token page opened
  // by a contractor already signed in elsewhere in the same browser) races
  // queryClient.clear() against that fetch and gets stuck loading forever.
  const hydrated = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      prevUserId.current = data.session?.user.id ?? null;
      hydrated.current = true;
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUserId = next?.user.id ?? null;
      // Drop the previous user's cached rows whenever the identity changes
      // (sign out, or signing in as someone else) — but not on first hydration.
      if (hydrated.current && prevUserId.current !== nextUserId) {
        queryClient.clear();
      }
      prevUserId.current = nextUserId;
      hydrated.current = true;
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const value: AuthContextValue = {
    session,
    loading,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }).then(({ error }) => ({ error })),
    signUp: (email, password) =>
      supabase.auth.signUp({ email, password }).then(({ data, error }) => ({
        error,
        needsEmailConfirmation: !error && !data.session,
      })),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

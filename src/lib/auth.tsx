import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, AuthError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getMyEmployeeRecord, type Employee } from "./api";

export type AccountRole = "owner" | "employee";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  /** "employee" once the signed-in user has a row in `employees` (0043);
   * "owner" otherwise (the default — every pre-existing account). */
  role: AccountRole;
  /** The signed-in employee's own row, or null for an owner. */
  employee: Employee | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** No employees row (migration not run yet, network hiccup, or genuinely
 * an owner) all fail the same way here: role resolves to "owner" rather
 * than blocking sign-in — RLS is what actually enforces access either
 * way, this is purely which shell to render. */
async function resolveEmployee(authUserId: string | null): Promise<Employee | null> {
  if (!authUserId) return null;
  try {
    return await getMyEmployeeRecord(authUserId);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
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
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      const emp = await resolveEmployee(uid);
      if (cancelled) return;
      setSession(data.session);
      setEmployee(emp);
      prevUserId.current = uid;
      hydrated.current = true;
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUserId = next?.user.id ?? null;
      // Same identity (e.g. a token refresh) — just update the session
      // object, no need to re-resolve role or touch loading/cache.
      if (hydrated.current && prevUserId.current === nextUserId) {
        setSession(next);
        return;
      }
      // Drop the previous user's cached rows whenever the identity changes
      // (sign out, or signing in as someone else) — but not on first hydration.
      if (hydrated.current && prevUserId.current !== nextUserId) {
        queryClient.clear();
      }
      // A genuine identity change — gate rendering on the new role
      // resolving too, so an employee account is never even briefly shown
      // the owner shell (or vice versa) while that lookup is in flight.
      setLoading(true);
      resolveEmployee(nextUserId).then((emp) => {
        if (cancelled) return;
        setSession(next);
        setEmployee(emp);
        prevUserId.current = nextUserId;
        hydrated.current = true;
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value: AuthContextValue = {
    session,
    loading,
    role: employee ? "employee" : "owner",
    employee,
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

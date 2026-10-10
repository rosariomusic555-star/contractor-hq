import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/api";
import { SIMPLE_EXTRAS, type SimpleExtraId } from "./prefs";
import { DEFAULT_EXTRAS, defaultState, parseLayoutState, type DashboardLayoutState } from "./layout";

function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked — the account copy still saves
  }
}

/** The optional cards a user had on in Customize (this browser's prefs)
 *  become their first layout; no prefs saved → the default. */
function migratedState(uid: string): DashboardLayoutState {
  const prefs = readLocal(`chq-dashboard-prefs:${uid}`) as { simpleExtras?: string[]; simpleExtrasV?: number } | null;
  if (!prefs) return defaultState();
  const known = new Set<string>(SIMPLE_EXTRAS.map((x) => x.id));
  let extras = Array.isArray(prefs.simpleExtras) ? prefs.simpleExtras : [];
  // Same upgrade as prefs.ts: "Money" used to include Bookings + Revenue.
  if ((prefs.simpleExtrasV ?? 1) < 2 && extras.includes("money")) extras = [...extras, "bookings", "revenue"];
  return defaultState([...new Set(extras)].filter((id): id is SimpleExtraId => known.has(id)));
}

/**
 * Each owner's Dashboard layout, saved to their account (dashboard_layouts,
 * migration 0169) so it follows them across devices — with a copy in this
 * browser, used when the table isn't there yet. Writes are debounced.
 */
export function useDashboardLayout() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? "anon";
  const localKey = `chq-dashboard-layout:${uid}`;
  const { data: remote, isFetched } = useQuery({ queryKey: ["dashboard-layout", uid], queryFn: getDashboardLayout, staleTime: Infinity, retry: 1 });
  const [state, setState] = useState<DashboardLayoutState | null>(null);
  const pending = useRef<DashboardLayoutState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const canSaveRemote = remote !== "missing";

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next && canSaveRemote) saveDashboardLayout(next).catch((err) => console.error("[Dashboard] layout save failed", err));
  }, [canSaveRemote]);

  const save = useCallback(
    (next: DashboardLayoutState) => {
      setState(next);
      writeLocal(localKey, next);
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [localKey, flush],
  );

  // First load: the account's layout, else this browser's copy, else the
  // user's Customize choices (saved to the account straight away).
  useEffect(() => {
    if (!isFetched || state) return;
    const fromRemote = remote && remote !== "missing" ? parseLayoutState(remote) : null;
    if (fromRemote) {
      setState(fromRemote);
      writeLocal(localKey, fromRemote);
      return;
    }
    const initial = parseLayoutState(readLocal(localKey)) ?? migratedState(uid);
    if (remote === "missing") setState(initial);
    else save(initial);
  }, [isFetched, remote, state, localKey, uid, save]);

  // Don't lose an edit made just before leaving the page.
  useEffect(() => () => flush(), [flush]);

  return { state, ready: !!state, save, savesToAccount: canSaveRemote, defaultExtras: DEFAULT_EXTRAS };
}

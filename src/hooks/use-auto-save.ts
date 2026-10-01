import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";

/**
 * The per-user "Auto-save changes" preference (default off). Kept in this
 * browser's storage under the signed-in user — a convenience, not data —
 * and shared live by every save bar on the page.
 */
const EVENT = "chq-autosave-change";
const keyFor = (userId: string | undefined) => `chq_autosave_v1:${userId ?? "anon"}`;

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useAutoSavePreference(): [boolean, (on: boolean) => void] {
  const { session } = useAuth();
  const key = keyFor(session?.user.id);
  const enabled = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (on: boolean) => {
      try {
        if (on) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      } catch {
        /* storage blocked — stays off */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [enabled, set];
}

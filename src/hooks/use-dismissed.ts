import { useCallback, useState } from "react";

/** A small "don't show this again" flag, remembered in this browser. */
export function useDismissed(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // storage blocked — hidden for this visit only
    }
  }, [key]);
  return [dismissed, dismiss];
}

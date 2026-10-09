import { useState } from "react";

const KEY = "materials-tracking-cards";

/**
 * Materials tab: the new per-line tracking cards vs. the current rows,
 * while the two are compared. Per browser; off (rows) by default.
 */
export function useTrackingCards(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* storage blocked — still switches for this visit */
    }
  };
  return [on, set];
}

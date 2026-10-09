import { useState } from "react";

const KEY = "crew-banner-header";

/**
 * Crew home: the new banner header vs. the current layout, while it's
 * compared. Per browser, off by default; `?banner=1` / `?banner=0` on the
 * crew home turns it on / off (and is remembered) — crews have no
 * Customize panel to put a switch in.
 */
export function useCrewBanner(): boolean {
  const [on] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("banner");
      if (q === "1" || q === "0") localStorage.setItem(KEY, q);
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  return on;
}

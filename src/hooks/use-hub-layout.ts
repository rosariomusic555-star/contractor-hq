import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type HubLayout = "classic" | "new";

const KEY = "chq-hub-layout";

/**
 * Client Hub desktop layout: "new" (the default) or the older single
 * column ("classic", still reachable via `?layout=classic`, remembered in
 * this browser; `?layout=new` switches back). Phones never see the
 * difference — the new layout only kicks in at md and up.
 */
export function useHubLayout(): HubLayout {
  const [params] = useSearchParams();
  const q = params.get("layout");
  const fromQuery = q === "new" || q === "classic" ? q : null;
  useEffect(() => {
    if (!fromQuery) return;
    try {
      localStorage.setItem(KEY, fromQuery);
    } catch {
      // storage blocked — the query param still works for this page
    }
  }, [fromQuery]);
  if (fromQuery) return fromQuery;
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
}

/** True while the viewport is at least `px` wide. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

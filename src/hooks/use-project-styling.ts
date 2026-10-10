import { useSyncExternalStore } from "react";

const KEY = "project-styling";

/**
 * The project page's "Updated styling" (dashboard look: type scale, soft
 * buttons, card links, badges above titles), while it's compared with the
 * current look. Per browser, off by default; `?styling=new|old` on the
 * project page sets it (and is remembered). Applied as the `.project-v2`
 * scope in index.css + a few markers in the project components.
 */
function read(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("styling");
    if (q === "new" || q === "old") localStorage.setItem(KEY, q === "new" ? "updated" : "classic");
    return localStorage.getItem(KEY) === "updated";
  } catch {
    return false;
  }
}

let current = read();
const listeners = new Set<() => void>();

function set(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "updated" : "classic");
  } catch {
    /* storage blocked — still switches for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProjectStyling(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => current), set];
}

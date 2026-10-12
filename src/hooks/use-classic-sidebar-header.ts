import { useSyncExternalStore } from "react";

const KEY = "sidebar-header";

/**
 * Customize › "Classic sidebar header": the white sidebar header instead of
 * the slate one that continues the page banner. Per browser, off by default.
 */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "classic";
  } catch {
    return false;
  }
}

let current = read();
const listeners = new Set<() => void>();

function set(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "classic" : "slate");
  } catch {
    /* storage blocked — still switches for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useClassicSidebarHeader(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => current), set];
}

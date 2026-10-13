import { useSyncExternalStore } from "react";

const KEY = "page-headers";

/**
 * Customize › "Classic page headers": the plain title row on list pages
 * instead of the slate page banner (PageHeader variant="plain"). Per browser,
 * off by default.
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
    localStorage.setItem(KEY, on ? "classic" : "banner");
  } catch {
    /* storage blocked — still switches for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useClassicPageHeaders(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => current), set];
}

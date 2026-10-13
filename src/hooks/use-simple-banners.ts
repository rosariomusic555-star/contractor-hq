import { useSyncExternalStore } from "react";

const KEY = "list-banners";

/**
 * Customize › "Simple banners": list pages' slate banner with just title,
 * subtitle and actions (PageHeader variant="banner") instead of the rich one
 * (insight, attention chips, stat tiles). Per browser, off by default.
 */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "simple";
  } catch {
    return false;
  }
}

let current = read();
const listeners = new Set<() => void>();

function set(on: boolean) {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "simple" : "rich");
  } catch {
    /* storage blocked — still switches for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSimpleBanners(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => current), set];
}

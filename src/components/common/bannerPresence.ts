import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * Which full-bleed banner (BleedBanner) is on the page right now. The sidebar
 * header is see-through, so the banner's own slate shows behind it (synced
 * with scrolling by construction); the header only needs to know whether a
 * banner exists, to draw the white copy of its company row. That copy's
 * reveal follows the banner's view timeline in CSS (.band-over in
 * index.css), not JS.
 */
let banner: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function registerBanner(el: HTMLElement | null) {
  banner = el;
  listeners.forEach((l) => l());
}

export function unregisterBanner(el: HTMLElement) {
  if (banner === el) registerBanner(null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether a page banner is mounted. */
export function useBannerPresent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!banner,
    () => false,
  );
}

/** The band (px from the top of the screen) the company row's split covers. */
const BAND = 60;

/**
 * Fallback for browsers without scroll-driven animations: writes the
 * banner's progress across the band (--band-p: 0 = banner covers it,
 * 1 = gone) on `target` once per scroll frame. Does nothing where CSS
 * `animation-timeline` is supported.
 */
export function useBandProgressFallback(target: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof CSS === "undefined" || CSS.supports("animation-timeline: view()")) return;
    let frame = 0;
    const write = () => {
      frame = 0;
      const t = target.current;
      if (!t) return;
      const bottom = banner ? banner.getBoundingClientRect().bottom : -Infinity;
      const p = 1 - Math.min(Math.max(bottom, 0), BAND) / BAND;
      t.style.setProperty("--band-p", String(p));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    write();
    const unsub = subscribe(write);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      unsub();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [target, enabled]);
}

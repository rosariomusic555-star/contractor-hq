import { useEffect, useState, type RefObject } from "react";

/**
 * Which full-bleed banner (BleedBanner) is on the page right now — so the
 * slate sidebar header knows when the banner is beside it (and can show its
 * tucked-in corner) and when it isn't (no banner, or scrolled away).
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

/** True while a banner reaches below the bottom of `header` (i.e. the
 *  banner's slate is right next to it). */
export function useBannerBeside(header: RefObject<HTMLElement>, enabled = true): boolean {
  const [beside, setBeside] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const h = header.current;
      setBeside(!!banner && !!h && banner.getBoundingClientRect().bottom >= h.getBoundingClientRect().bottom);
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (header.current) ro?.observe(header.current);
    // A banner arriving (or changing) later: watch its size too.
    const onBanner = () => {
      if (banner) ro?.observe(banner);
      check();
    };
    onBanner();
    listeners.add(onBanner);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      listeners.delete(onBanner);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro?.disconnect();
    };
  }, [header, enabled]);
  return enabled && beside;
}

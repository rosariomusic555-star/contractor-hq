import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * Which full-bleed banner (BleedBanner) is on the page right now — so the
 * sidebar header knows whether the banner's slate is behind it (transparent
 * header, white text, tucked-in nav corner) or not (no banner, or scrolled
 * away: the white header).
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

/** True while a banner reaches at least to the bottom of `header`, i.e. the
 *  banner fully covers it. Checked before paint (banner registration and
 *  route changes are layout effects), so a page never paints with the wrong
 *  header style. */
export function useBannerBehind(header: RefObject<HTMLElement>, enabled = true): boolean {
  const [behind, setBehind] = useState(false);
  const check = useRef<() => void>(() => {});
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (!enabled) return;
    check.current = () => {
      const h = header.current;
      setBehind(!!banner && !!h && banner.getBoundingClientRect().bottom >= h.getBoundingClientRect().bottom);
    };
    const run = () => check.current();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(run) : null;
    if (header.current) ro?.observe(header.current);
    // A banner arriving (or changing) later: watch its size too.
    const onBanner = () => {
      if (banner) ro?.observe(banner);
      run();
    };
    onBanner();
    listeners.add(onBanner);
    window.addEventListener("scroll", run, { passive: true });
    window.addEventListener("resize", run);
    return () => {
      check.current = () => {};
      listeners.delete(onBanner);
      window.removeEventListener("scroll", run);
      window.removeEventListener("resize", run);
      ro?.disconnect();
    };
  }, [header, enabled]);

  // New page: re-check right away (scroll position and banner both change).
  useLayoutEffect(() => {
    check.current();
  }, [pathname]);

  return enabled && behind;
}

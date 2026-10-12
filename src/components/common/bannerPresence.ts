import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * Which full-bleed banner (BleedBanner) is on the page right now, so the
 * sidebar header can line its slate / white split up with the banner's
 * bottom edge.
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

/**
 * Tracks the page banner's bottom edge against the sidebar's header zone and
 * writes it to `target` as a CSS variable, every scroll frame, without
 * re-rendering:
 *
 *   --banner-edge  banner bottom − zone top, clamped to [0, zone height]
 *                  (0 = no banner / scrolled away, zone height = covers it)
 *
 * Returns whether a banner is on the page at all (re-renders only when that
 * changes), so the header can skip its slate layer and white twin without one.
 */
export function useBannerEdge(target: RefObject<HTMLElement>, zone: RefObject<HTMLElement>, enabled = true): boolean {
  const [present, setPresent] = useState(false);
  const update = useRef<() => void>(() => {});
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    update.current = () => {
      const t = target.current;
      const z = zone.current;
      if (!t || !z) return;
      setPresent(!!banner);
      const zr = z.getBoundingClientRect();
      const bottom = banner ? banner.getBoundingClientRect().bottom : -Infinity;
      const edge = Math.min(Math.max(bottom - zr.top, 0), zr.height);
      t.style.setProperty("--banner-edge", `${edge}px`);
    };
    const now = () => update.current();
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        update.current();
      });
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(now) : null;
    if (zone.current) ro?.observe(zone.current);
    // A banner arriving (or changing size) later: watch it too.
    const onBanner = () => {
      if (banner) ro?.observe(banner);
      now();
    };
    onBanner();
    listeners.add(onBanner);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", now);
    return () => {
      cancelAnimationFrame(frame);
      update.current = () => {};
      listeners.delete(onBanner);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", now);
      ro?.disconnect();
    };
  }, [target, zone, enabled]);

  // New page: re-measure right away (scroll position and banner both change).
  useLayoutEffect(() => {
    update.current();
  }, [pathname]);

  return enabled && present;
}

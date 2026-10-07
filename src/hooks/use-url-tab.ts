import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * The active tab of a tabbed page, kept in the URL (`?tab=<id>`), so links can
 * open a tab directly and browser back / forward moves between tabs. The
 * default tab has no param. Other query params are left alone.
 *
 * Each tab keeps its own scroll position: switching back returns to where you
 * were; a tab you haven't opened yet starts at the tab bar (`anchorRef`), or
 * stays put if the page isn't scrolled that far.
 */
export function useUrlTab<T extends string>(ids: readonly T[], fallback: T, param = "tab", aliases: Record<string, T> = {}) {
  const [params, setParams] = useSearchParams();
  const raw0 = params.get(param);
  // An old key (e.g. ?tab=estimate) opens its tab now.
  const raw = raw0 && aliases[raw0] ? aliases[raw0] : raw0;
  const active = (raw && (ids as readonly string[]).includes(raw) ? raw : fallback) as T;

  const scrolls = useRef(new Map<string, number>());
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // While a tab is being put back, its content may still be loading — don't
  // record those in-between positions.
  const restoring = useRef(false);

  // Remember the active tab's scroll position as the page scrolls.
  useEffect(() => {
    const onScroll = () => {
      if (!restoring.current) scrolls.current.set(activeRef.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // On a tab change, put that tab back where it was.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const saved = scrolls.current.get(active);
    const anchor = anchorRef.current ? anchorRef.current.getBoundingClientRect().top + window.scrollY : 0;
    const target = saved ?? Math.min(window.scrollY, anchor);
    // The new tab's cards can take a moment to fill in (cached queries,
    // images), so keep trying for a short while until the page is tall
    // enough to land on the target.
    restoring.current = true;
    let timer = 0;
    const startedAt = Date.now();
    const step = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 1 && Date.now() - startedAt < 1000) timer = window.setTimeout(step, 50);
      else restoring.current = false;
    };
    step();
    const stop = () => {
      window.clearTimeout(timer);
      restoring.current = false;
    };
    // The user scrolling takes over.
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [active]);

  const setActive = useCallback(
    (next: T) => {
      if (next === activeRef.current) return;
      scrolls.current.set(activeRef.current, window.scrollY);
      const p = new URLSearchParams(params);
      if (next === fallback) p.delete(param);
      else p.set(param, next);
      setParams(p); // a push, so back / forward steps through tabs
    },
    [params, setParams, fallback, param],
  );

  return { active, setActive, anchorRef };
}


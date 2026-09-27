import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { trackSharedQuoteEvent, trackSharedQuoteView } from "@/lib/api";
import { trackPortalQuoteEvent, trackPortalQuoteView } from "@/lib/portalApi";
import { deviceType } from "@/lib/quoteActivity";

const HEARTBEAT_MS = 30_000;

function sessionKeyFor(id: string): string {
  const k = `quote-view:${id}`;
  try {
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(k, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Quote activity (0117) — records that a client has a quote open: one call
 * on open, then a heartbeat every 30 s while the tab is visible (active
 * time), plus which sections (`data-track-section="Name"`) scrolled into
 * view. Our own backend only; a random per-tab key, a coarse device type,
 * no IP stored. Nothing is sent while the viewer is signed in to the app
 * (the contractor or their team) — the server also ignores them.
 */
export function useQuoteTracking(opts: { channel: "hub" | "link"; quoteId?: string | null; token?: string | null; enabled: boolean }) {
  const id = opts.channel === "hub" ? opts.quoteId : opts.token;
  const keyRef = useRef<string | null>(null);
  const activeSince = useRef<number | null>(null);
  const pendingSections = useRef<Set<string>>(new Set());
  const allowed = useRef(false);

  const send = useCallback(async () => {
    if (!allowed.current || !id || !keyRef.current) return;
    const now = Date.now();
    const active = activeSince.current ? Math.round((now - activeSince.current) / 1000) : 0;
    activeSince.current = document.visibilityState === "visible" ? now : null;
    const sections = [...pendingSections.current];
    pendingSections.current.clear();
    try {
      if (opts.channel === "hub") await trackPortalQuoteView(id, keyRef.current, deviceType(), active, sections);
      else await trackSharedQuoteView(id, keyRef.current, deviceType(), active, sections);
    } catch {
      // tracking never gets in the client's way
    }
  }, [id, opts.channel]);

  useEffect(() => {
    if (!opts.enabled || !id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let observer: IntersectionObserver | null = null;
    keyRef.current = sessionKeyFor(id);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void send();
      else activeSince.current = Date.now();
    };

    (async () => {
      // The share link: skip when the contractor (or anyone signed in to
      // the app) opens it. The Hub uses the client's own login.
      if (opts.channel === "link") {
        const { data } = await supabase.auth.getSession();
        if (data.session) return;
      }
      if (cancelled) return;
      allowed.current = true;
      activeSince.current = document.visibilityState === "visible" ? Date.now() : null;
      await send();
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void send();
      }, HEARTBEAT_MS);
      document.addEventListener("visibilitychange", onVisibility);
      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const name = (e.target as HTMLElement).dataset.trackSection;
              if (e.isIntersecting && name) pendingSections.current.add(name);
            }
          },
          { threshold: 0.5 },
        );
        // Sections render with the quote; observe after paint.
        setTimeout(() => document.querySelectorAll("[data-track-section]").forEach((el) => observer?.observe(el)), 500);
      }
    })();

    return () => {
      cancelled = true;
      if (allowed.current) void send();
      allowed.current = false;
      if (timer) clearInterval(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [opts.enabled, id, opts.channel, send]);

  const trackEvent = useCallback(
    (kind: "pdf_downloaded" | "optional_changed", detail: Record<string, unknown> = {}) => {
      if (!allowed.current || !id || !keyRef.current) return;
      const p = opts.channel === "hub" ? trackPortalQuoteEvent(id, keyRef.current, kind, detail) : trackSharedQuoteEvent(id, keyRef.current, kind, detail);
      void p.catch(() => undefined);
    },
    [id, opts.channel],
  );

  return { trackEvent };
}

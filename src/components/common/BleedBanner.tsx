import { useLayoutEffect, useRef, type ReactNode } from "react";
import { registerBanner, unregisterBanner } from "./bannerPresence";
import { cn } from "@/lib/utils";

/**
 * The full-bleed slate banner at the top of a page (project page,
 * Dashboard, crew home): flush with the top (its negative top margin
 * matches AppLayout's / EmployeeLayout's top padding), background edge to edge
 * (`.bleed-banner`), content aligned with the page's own column. Must be
 * the page's first element inside the padded content wrapper.
 */
export function BleedBanner({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLElement>(null);
  // Tells the sidebar header a banner is behind it (bannerPresence) —
  // before paint, so the header never shows the wrong style first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerBanner(el);
    return () => unregisterBanner(el);
  }, []);
  return (
    <header ref={ref} aria-label={label} className={cn("bleed-banner -mt-4 pb-4 pt-3 text-banner-foreground md:-mt-6 md:pb-5 md:pt-4 lg:-mt-8", className)}>
      {children}
    </header>
  );
}

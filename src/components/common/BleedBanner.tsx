import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The full-bleed slate banner at the top of a page (project page,
 * Dashboard, crew home): flush with the top (its negative top margin
 * matches AppLayout's / EmployeeLayout's top padding), background edge to edge
 * (`.bleed-banner`), content aligned with the page's own column. Must be
 * the page's first element inside the padded content wrapper.
 */
export function BleedBanner({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <header aria-label={label} className={cn("bleed-banner -mt-4 pb-4 pt-3 text-banner-foreground md:-mt-6 md:pb-5 md:pt-4 lg:-mt-8", className)}>
      {children}
    </header>
  );
}

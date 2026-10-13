import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Buttons on the slate page banner (Dashboard, list pages' PageHeader). */
export const ON_BANNER_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

/** Secondary: outlined white. */
export const BANNER_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-1 rounded-[0.625rem] border border-white/60 bg-transparent px-3.5 text-sm font-semibold text-banner-foreground transition-colors hover:bg-black/15 disabled:opacity-60 " +
  ON_BANNER_RING;

/** Main action: the brand light green with ink text (primary-light) — same
 *  size and radius as the outlined banner buttons. */
export const BANNER_PRIMARY = cn(buttonVariants({ variant: "primary-light" }), "h-10 gap-1.5 rounded-[0.625rem] px-4 focus-visible:ring-white/80 focus-visible:ring-offset-0");

import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Anything that already does its own thing on click. */
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=button], [role=switch], [role=checkbox], [role=tab], [role=menuitem], [data-no-card-link]";

/**
 * Makes a whole dashboard card a tap target without a nested <a> (the card
 * has its own links/buttons inside). A click that lands on an inner link,
 * button or control does that control's thing; a click anywhere else on the
 * card goes to `to`. Selecting text doesn't navigate; cmd/ctrl-click opens a
 * new tab. Keyboard users keep the card's own "View all" / title link.
 *
 * `desktop`: also on md+ screens — only for cards with a single
 * destination. Below md every card with a destination is tappable.
 */
export function useCardLink(to: string | null | undefined, { desktop = false }: { desktop?: boolean } = {}) {
  const navigate = useNavigate();
  if (!to) return { onClick: undefined, className: "" };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // React bubbles clicks out of portals (a dialog opened from the card) —
    // only clicks physically on the card count.
    if (!e.currentTarget.contains(target)) return;
    const hit = target.closest(INTERACTIVE);
    if (hit && e.currentTarget.contains(hit)) return;
    if (!desktop && window.matchMedia("(min-width: 768px)").matches) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(to, "_blank", "noopener");
    else navigate(to);
  };
  return {
    onClick,
    className: cn(
      "max-md:cursor-pointer max-md:active:bg-muted/30",
      desktop && "md:cursor-pointer md:transition-shadow md:hover:shadow-card-hover",
    ),
  };
}

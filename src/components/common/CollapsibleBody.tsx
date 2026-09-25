import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated collapse for a card's body: a 1fr ↔ 0fr grid-row transition, so
 * the height eases to/from the content's real height with no measuring and
 * no jump. Content stays mounted while collapsed (half-typed inputs keep
 * their text) but is `inert` — not focusable, not clickable, hidden from
 * screen readers.
 */
export function CollapsibleBody({ collapsed, children, id }: { collapsed: boolean; children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
      // React 18 has no typed `inert` prop — an empty-string attribute sets it.
      {...(collapsed ? { inert: "" } : {})}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { canGoBackInApp, useGoBack } from "@/hooks/use-go-back";
import { cn } from "@/lib/utils";

/**
 * The one back control used across the app (desktop "‹ Projects" links and
 * the mobile header's back link). A click returns to the previous screen
 * (useGoBack); with no in-app history it goes to `to`, the parent route —
 * and its label says where it goes: "Back" vs. the parent's own name.
 * Still a real link to the parent, so middle/cmd-click opens that in a new tab.
 */
export function BackLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const goBack = useGoBack(to);
  const inApp = canGoBackInApp();
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goBack();
      }}
      className={cn("inline-flex items-center", className)}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {inApp ? "Back" : children}
    </a>
  );
}

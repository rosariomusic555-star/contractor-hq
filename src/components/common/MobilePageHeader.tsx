import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/common/BackLink";

/**
 * The slate `#687B85` block that tops every phone screen. Full-bleeds out of
 * the layout's `p-4` and sits under the notch. Hidden at `md+`.
 */
export function MobilePageHeader({
  title,
  subtitle,
  back,
  actions,
  pills,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  pills?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mobile-header -mx-4 -mt-4 mb-4 md:hidden", className)}>
      {back && (
        <BackLink
          to={back.to}
          className="tap-target mb-1 inline-flex items-center text-xs font-semibold text-sidebar-foreground/70"
        >{back.label}</BackLink>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle != null && (
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">{subtitle}</p>
          )}
        </div>
        {actions != null && <div className="shrink-0">{actions}</div>}
      </div>
      {pills != null && <div className="mt-3 flex flex-wrap gap-2">{pills}</div>}
      {children}
    </div>
  );
}

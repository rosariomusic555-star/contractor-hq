import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Desktop page header — big title + subtitle + right-aligned actions. Hidden
 * below `md` (phone screens use `MobilePageHeader`).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hidden items-end justify-between gap-5 md:flex", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
        {subtitle != null && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions != null && <div className="flex shrink-0 gap-2.5">{actions}</div>}
    </div>
  );
}

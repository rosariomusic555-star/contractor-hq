import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label + right-aligned tabular amount, hairline divider. The totals-list row. */
export function MoneyRow({
  label,
  value,
  strong,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-0",
        className,
      )}
    >
      <span className={cn("text-[13px] text-muted-foreground", strong && "font-semibold text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums font-bold text-foreground",
          strong ? "text-[15px] font-extrabold" : "text-[13px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

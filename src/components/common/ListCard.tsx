import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Mobile list-row card — white, hairline border, coloured 3px left edge by
 * status. Used by the phone layouts of the list screens.
 */
export function ListCard({
  borderColor,
  eyebrow,
  eyebrowColor,
  eyebrowRight,
  title,
  subtitle,
  children,
  to,
  className,
}: {
  /** CSS colour for the left edge (see `StatusMeta.border`). */
  borderColor?: string;
  eyebrow?: ReactNode;
  /** CSS colour for the eyebrow text; defaults to the subtle grey. */
  eyebrowColor?: string;
  eyebrowRight?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  to?: string;
  className?: string;
}) {
  const inner = (
    <>
      {(eyebrow != null || eyebrowRight != null) && (
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle"
            style={eyebrowColor ? { color: eyebrowColor } : undefined}
          >
            {eyebrow}
          </span>
          <span className="text-xs font-bold text-foreground">{eyebrowRight}</span>
        </div>
      )}
      <p className="mt-1 truncate text-base font-bold tracking-tight text-foreground">{title}</p>
      {subtitle != null && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</p>}
      {children}
    </>
  );

  const cls = cn(
    "block card-surface border-l-[3px] p-3.5 transition-shadow",
    to && "hover:shadow-card-hover",
    className,
  );
  const style = borderColor ? { borderLeftColor: borderColor } : undefined;

  return to ? (
    <Link to={to} className={cls} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

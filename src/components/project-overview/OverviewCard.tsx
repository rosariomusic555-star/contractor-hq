import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CardLink {
  label: string;
  to?: string;
  onClick?: () => void;
}

class CardBoundary extends Component<{ children: ReactNode; onRetry?: () => void }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[overview card]", error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <CardError
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry?.();
          }}
        />
      );
    return this.props.children;
  }
}

function CardError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
      <span>Couldn't load this.</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

function HeaderLink({ link }: { link: CardLink }) {
  const cls = "inline-flex min-h-9 items-center rounded-md px-1.5 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return link.to ? (
    <Link to={link.to} className={cls}>
      {link.label} →
    </Link>
  ) : (
    <button type="button" onClick={link.onClick} className={cls}>
      {link.label} →
    </button>
  );
}

/**
 * One New overview card: a compact "Title · link →" header, then its body —
 * or a skeleton while loading, or a small error with Retry. Each card fails
 * on its own (render errors are caught here too).
 */
export function OverviewCard({
  title,
  headerTo,
  links = [],
  status = "ready",
  onRetry,
  className,
  skeletonRows = 3,
  children,
}: {
  title: string;
  /** The title opens this (the whole header reads as "open"). */
  headerTo?: string;
  links?: CardLink[];
  status?: "loading" | "error" | "ready";
  onRetry?: () => void;
  className?: string;
  skeletonRows?: number;
  children?: ReactNode;
}) {
  return (
    <section className={cn("rounded-card border border-border bg-card p-5", className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold text-foreground">
          {headerTo ? (
            <Link to={headerTo} className="inline-flex min-h-9 items-center rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {links.length > 0 && (
          <div className="-mr-1.5 flex flex-wrap items-center gap-x-2">
            {links.map((l) => (
              <HeaderLink key={l.label} link={l} />
            ))}
          </div>
        )}
      </div>
      {status === "loading" ? (
        <div className="space-y-2.5" aria-busy="true" aria-label={`Loading ${title}`}>
          {Array.from({ length: skeletonRows }, (_, i) => (
            <Skeleton key={i} className={cn("h-4", i % 2 ? "w-2/3" : "w-full")} />
          ))}
        </div>
      ) : status === "error" ? (
        <CardError onRetry={onRetry} />
      ) : (
        <CardBoundary onRetry={onRetry}>{children}</CardBoundary>
      )}
    </section>
  );
}

/** "Label ........ value" — a compact fact row with tabular numbers. */
export function FactRow({ label, value, strong, className }: { label: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right tabular-nums text-foreground", strong ? "text-base font-bold" : "font-semibold")}>{value}</span>
    </div>
  );
}

/** Thin neutral bar, capped at 100%. */
export function ThinBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="presentation">
      <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** Empty state with the right action. */
export function CardEmpty({ text, action }: { text: string; action?: CardLink }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{text}</span>
      {action && <HeaderLink link={action} />}
    </div>
  );
}

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useDashCell } from "./dashCell";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useCardLink } from "@/hooks/use-card-link";

/** One card failing never breaks the Dashboard. */
export class CardErrorBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[Dashboard] ${this.props.title} card failed`, err);
  }
  render() {
    if (this.state.failed)
      return (
        <section className="card-surface px-4 py-3 text-sm text-muted-foreground">
          {this.props.title} couldn't load. <button type="button" className="font-semibold text-primary" onClick={() => this.setState({ failed: false })}>Try again</button>
        </section>
      );
    return this.props.children;
  }
}

/** Mounts children once the slot scrolls near the viewport (below-the-fold cards don't fetch on first paint). */
export function LazyMount({ children, eager, minHeight = 120 }: { children: ReactNode; eager?: boolean; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(!!eager || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (show || !ref.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShow(true), { rootMargin: "400px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [show]);
  return show ? <>{children}</> : <div ref={ref} style={{ minHeight }} className="card-surface animate-pulse bg-muted/30" aria-hidden />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-4 py-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  );
}

/**
 * The shared card chrome: compact header "Title · count", optional right
 * slot / "View all", rows with dividers inside. Dense on purpose (matches the
 * Quote builder / Cost plan style).
 *
 * The whole card is a tap target (useCardLink) going to `to` (default: the
 * "View all" page) — on phones always; on desktop only when `single` (the
 * card has one destination, so a row can't mean something else).
 */
export function Card({
  title,
  count,
  viewAll,
  right,
  children,
  className,
  id,
  to,
  single,
}: {
  title: ReactNode;
  count?: number | string | null;
  viewAll?: { to: string; label?: string };
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  to?: string;
  single?: boolean;
}) {
  const link = useCardLink(to ?? viewAll?.to, { desktop: single });
  const cell = useDashCell();
  const label = viewAll?.label ?? "View all";
  return (
    <section id={id} onClick={link.onClick} className={cn("card-surface overflow-hidden p-0", cell && "flex h-full flex-col", link.className, className)}>
      <header className="flex min-h-[44px] items-center gap-2 border-b border-hairline px-4 py-2">
        <h3 className="flex-1 truncate text-sm font-bold text-foreground">
          {title}
          {count != null && count !== "" && <span className="font-semibold text-muted-foreground"> · {count}</span>}
        </h3>
        {right}
        {viewAll && (
          // Shared card-link style (index.css): padded hover area, arrow nudge.
          <Link to={viewAll.to} className="card-link">
            {label.replace(/\s*→\s*$/, "")}
            <span aria-hidden className="card-link-arrow">→</span>
          </Link>
        )}
      </header>
      {cell ? <CellScroll>{children}</CellScroll> : children}
    </section>
  );
}

/**
 * A grid card's body. The card keeps its height with the content top-aligned;
 * it only becomes a scroll box when the content is actually taller, so the
 * wheel / trackpad / touch over a card that fits scrolls the page. No
 * overscroll containment: at the top or bottom of a scrolling card the page
 * takes over. data-dash-content is what the grid measures to fit the card.
 */
function CellScroll({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    // 1px slack: sub-pixel rounding shouldn't turn a card that fits into a
    // scroll box that swallows the gesture.
    const check = () => setScrolls(i.offsetHeight > o.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(o);
    ro.observe(i);
    check();
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} data-dash-scroll={scrolls ? "" : undefined} className={cn("min-h-0 flex-1", scrolls ? "overflow-y-auto" : "overflow-hidden")}>
      <div ref={inner} data-dash-content>
        {children}
      </div>
    </div>
  );
}

/** The one-line empty state (cards that don't hide themselves). */
export const EmptyLine = ({ children }: { children: ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type PageTabBadgeTone = "alert" | "warn" | "neutral";

export interface PageTab<T extends string = string> {
  id: T;
  label: string;
  /** A small count next to the label — hidden when 0 / null. */
  badge?: number | null;
  badgeTone?: PageTabBadgeTone;
  /** What the badge counts, for screen readers ("1 overdue invoice"). */
  badgeLabel?: string;
}

const BADGE_TONE: Record<PageTabBadgeTone, string> = {
  alert: "bg-destructive/15 text-destructive",
  warn: "bg-warning/20 text-warning-strong",
  neutral: "bg-muted text-muted-foreground",
};

function Badge({ tab }: { tab: PageTab }) {
  if (!tab.badge) return null;
  return (
    <span
      className={cn("ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5 tabular-nums", BADGE_TONE[tab.badgeTone ?? "neutral"])}
      aria-label={tab.badgeLabel}
    >
      {tab.badge}
    </span>
  );
}

/**
 * The app's one tab bar (project page first; built to be reused on the
 * opportunity page). Underline on the active tab; scrolls sideways on phones
 * with the active tab kept in view; an optional "More" overflow — a menu on
 * desktop, a bottom sheet on phones. Sticks to the top of the page; `compact`
 * shows `title` above the tabs once the page header has scrolled away.
 *
 * Presentational only — pair it with useUrlTab for the URL / scroll state.
 */
export function PageTabs<T extends string>({
  tabs,
  overflow = [],
  overflowLabel = "More",
  active,
  onChange,
  title,
  titleClassName,
  compact = false,
  className,
  ariaLabel = "Sections",
}: {
  tabs: PageTab<T>[];
  overflow?: PageTab<T>[];
  overflowLabel?: string;
  active: T;
  onChange: (id: T) => void;
  title?: ReactNode;
  /** Extra classes for the compact title's wrapper (e.g. to bleed wider). */
  titleClassName?: string;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const isMobile = useIsMobile();
  const scroller = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const activeOverflow = overflow.find((t) => t.id === active) ?? null;
  const overflowBadge = overflow.reduce((s, t) => s + (t.badge ?? 0), 0);

  // Keep the active tab in view in the sideways-scrolling bar (straight
  // there on first load, smoothly after).
  const placed = useRef(false);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    const behavior: ScrollBehavior = placed.current ? "smooth" : "auto";
    placed.current = true;
    const left = el.offsetLeft - 16;
    const right = el.offsetLeft + el.offsetWidth + 16;
    if (left < box.scrollLeft) box.scrollTo({ left, behavior });
    else if (right > box.scrollLeft + box.clientWidth) box.scrollTo({ left: right - box.clientWidth, behavior });
  }, [active]);

  const tabClass = (on: boolean) =>
    cn(
      "relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
      on ? "text-foreground after:bg-primary" : "text-muted-foreground after:bg-transparent hover:text-foreground",
    );

  const moreButtonInner = (
    <>
      {activeOverflow ? activeOverflow.label : overflowLabel}
      {!activeOverflow && overflowBadge > 0 && <Badge tab={{ id: "more", label: "", badge: overflowBadge, badgeTone: "neutral" }} />}
      <ChevronDown className="ml-1 h-3.5 w-3.5" />
    </>
  );

  return (
    <div className={cn("sticky top-0 z-20 -mx-4 bg-background px-4 md:mx-0 md:px-0", className)}>
      {title && (
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            compact ? "max-h-14 py-2 opacity-100" : "max-h-0 py-0 opacity-0",
            titleClassName,
          )}
          aria-hidden={!compact}
        >
          {title}
        </div>
      )}
      <div className="flex items-stretch border-b border-border">
        <div ref={scroller} role="tablist" aria-label={ariaLabel} className="scrollbar-hide relative -mb-px flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === active}
              data-active={t.id === active}
              onClick={() => onChange(t.id)}
              className={tabClass(t.id === active)}
            >
              {t.label}
              <Badge tab={t} />
            </button>
          ))}
          {overflow.length > 0 && isMobile && (
            <button type="button" data-active={!!activeOverflow} onClick={() => setMoreOpen(true)} className={tabClass(!!activeOverflow)}>
              {moreButtonInner}
            </button>
          )}
        </div>
        {overflow.length > 0 && !isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(tabClass(!!activeOverflow), "-mb-px")}>
                {moreButtonInner}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {overflow.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => onChange(t.id)}
                  className={cn("min-h-10 font-semibold", t.id === active && "text-foreground")}
                >
                  {t.label}
                  <Badge tab={t} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {overflow.length > 0 && isMobile && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="text-left">
              <SheetTitle>{overflowLabel}</SheetTitle>
            </SheetHeader>
            <div className="mt-3 flex flex-col">
              {overflow.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onChange(t.id);
                  }}
                  className={cn(
                    "flex min-h-12 items-center rounded-lg px-3 text-left text-base font-semibold",
                    t.id === active ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                  <Badge tab={t} />
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

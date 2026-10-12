import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MoreHorizontal, X } from "lucide-react";
import { BackLink } from "@/components/common/BackLink";
import { BleedBanner } from "@/components/common/BleedBanner";
import { BANNER_SECONDARY } from "@/components/common/bannerStyles";
import { StatTile, type TileVisual } from "@/components/common/StatTile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { navGroups } from "@/components/layout/navItems";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

/** An attention chip: "{count} {label}", shown only when count > 0. */
export interface BannerChip {
  key: string;
  label: string;
  count: number;
  /** Not shown in the chip row — a filter only a tile sets (still named
   *  by ActiveChipNote). */
  hidden?: boolean;
}

/** A stat tile in the banner (the Dashboard tile, StatTile). */
export interface BannerTile {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: "muted" | "positive" | "negative";
  icon?: ComponentType<{ className?: string }>;
  alert?: boolean;
  visual?: TileVisual;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}

/** Everything a list page's rich banner shows besides title and actions. */
export interface RichBanner {
  /** The one most useful sentence for the page, from real data. */
  insight: ReactNode;
  chips?: BannerChip[];
  activeChip?: string | null;
  /** Chip clicked (null = cleared). The banner scrolls to `listId` after. */
  onChip?: (key: string | null) => void;
  /** Usually four. */
  tiles?: BannerTile[];
  loading?: boolean;
  /** Element id of the list the chips / tiles filter (scrolled to on click). */
  listId?: string;
  /** Less common actions behind "⋯" (only ones the page already has). */
  overflow?: { label: string; onSelect: () => void }[];
}

/** "Money · Monday, October 12" — the sidebar group of the current page. */
function useEyebrow(): string {
  const { pathname } = useLocation();
  const group = navGroups.find((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)));
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const section = group ? group.label.charAt(0) + group.label.slice(1).toLowerCase() : "Overview";
  return `${section} · ${date}`;
}

function scrollToList(listId?: string) {
  if (!listId) return;
  // After the filter re-renders the list.
  setTimeout(() => document.getElementById(listId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

/** Pick / clear a chip, then bring the list into view. */
function pickChip(rich: RichBanner, key: string) {
  const next = rich.activeChip === key ? null : key;
  rich.onChip?.(next);
  if (next) scrollToList(rich.listId);
}

function Chips({ rich, phone = false, onPage = false }: { rich: RichBanner; phone?: boolean; onPage?: boolean }) {
  const chips = (rich.chips ?? []).filter((c) => c.count > 0 && !c.hidden);
  if (rich.loading || chips.length === 0) return null;
  return (
    <div className={cn("flex gap-2", phone ? "-mx-4 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" : "flex-wrap")}>
      {chips.map((c) => {
        const active = rich.activeChip === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => pickChip(rich, c.key)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
              onPage
                ? active
                  ? "bg-foreground text-background focus-visible:ring-ring"
                  : "bg-muted text-foreground hover:bg-muted/70 focus-visible:ring-ring"
                : active
                  ? "bg-white text-foreground focus-visible:ring-white/80"
                  : "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white/80",
            )}
          >
            <span className="tabular-nums">{c.count}</span> {c.label}
          </button>
        );
      })}
    </div>
  );
}

function Tile({ t, loading, rich, className }: { t: BannerTile; loading?: boolean; rich: RichBanner; className?: string }) {
  const onClick = t.onClick
    ? () => {
        t.onClick!();
        scrollToList(rich.listId);
      }
    : undefined;
  return (
    <StatTile
      label={t.label}
      value={t.value}
      sub={t.sub}
      subTone={t.subTone}
      icon={t.icon}
      alert={t.alert}
      visual={t.visual}
      to={t.to}
      onClick={onClick}
      active={t.active}
      loading={loading}
      className={className}
    />
  );
}

function Overflow({ items }: { items: NonNullable<RichBanner["overflow"]> }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More actions" className={cn(BANNER_SECONDARY, "w-10 px-0")}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((i) => (
          <DropdownMenuItem key={i.label} className="min-h-10 font-semibold" onSelect={i.onSelect}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The rich list-page banner (PageHeader variant="rich"), desktop / tablet:
 * eyebrow (section · date, on the sidebar's company-row line like the
 * Dashboard's date), title, an insight sentence, actions (+ "⋯"), attention
 * chips that filter the list, and four stat tiles straddling the bottom
 * edge. Built on BleedBanner, so the sidebar's slate and company-row split
 * follow it. Must be the page's first visible element on md+.
 */
export function ListBanner({
  title,
  actions,
  back,
  rich,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  rich: RichBanner;
  className?: string;
}) {
  const eyebrow = useEyebrow();
  const tiles = rich.tiles ?? [];
  return (
    // -mt (important): flush with the top over the main padding, whatever
    // space-y margin the page's wrapper gives it.
    <div className={cn("hidden md:block md:!-mt-6 lg:!-mt-8", className)}>
      <BleedBanner
        label={typeof title === "string" ? title : undefined}
        className={cn("relative mt-0 pt-5 md:mt-0 md:pt-5 lg:mt-0", tiles.length ? "pb-[84px] md:pb-[84px]" : "pb-6 md:pb-6")}
      >
        {/* A soft highlight toward the top right, fading out before the
            column's edge (the band beyond it is the flat box-shadow). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_30%_130%_at_72%_0%,rgba(255,255,255,0.07),transparent)]" />
        <div className="relative">
          {back ? (
            <BackLink to={back.to} className="inline-flex h-5 items-center text-sm font-semibold text-banner-foreground/80 hover:text-banner-foreground">
              {back.label}
            </BackLink>
          ) : (
            <p className="text-[13px] font-semibold leading-5 text-banner-foreground/70 md:text-sm">{eyebrow}</p>
          )}
          <div className="mt-1 flex items-start justify-between gap-5">
            <div className="min-w-0">
              <h1 className="text-[32px] font-bold leading-[1.15] tracking-tight lg:text-[34px]">{title}</h1>
              {rich.loading ? (
                <span className="mt-2.5 block h-4 w-72 max-w-full animate-pulse rounded bg-white/20" />
              ) : (
                <p className="mt-1.5 text-base text-banner-foreground/85 [&_.text-foreground]:text-banner-foreground">{rich.insight}</p>
              )}
            </div>
            {(actions != null || (rich.overflow?.length ?? 0) > 0) && (
              <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-1">
                {actions}
                <Overflow items={rich.overflow ?? []} />
              </div>
            )}
          </div>
          <div className="mt-3 empty:hidden">
            <Chips rich={rich} />
          </div>
        </div>
      </BleedBanner>
      {tiles.length > 0 && (
        <div className="relative z-[1] -mt-16 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {tiles.map((t) => (
            <Tile key={t.key} t={t} loading={rich.loading} rich={rich} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Phone: the insight + chips inside the slate MobilePageHeader. */
export function ListBannerPhoneHeader({ rich }: { rich: RichBanner }) {
  return (
    <div className="mt-2 space-y-3">
      {rich.loading ? (
        <span className="block h-3.5 w-56 animate-pulse rounded bg-white/20" />
      ) : (
        <p className="text-sm text-sidebar-foreground/85 [&_.text-foreground]:text-sidebar-foreground">{rich.insight}</p>
      )}
      <Chips rich={rich} phone />
    </div>
  );
}

/** Phone: the tiles as a swipeable row (≈70% wide), under the header. */
export function ListBannerPhoneTiles({ rich }: { rich: RichBanner }) {
  const tiles = rich.tiles ?? [];
  if (tiles.length === 0) return null;
  return (
    <div className="-mx-4 -mt-1 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none]">
      {tiles.map((t) => (
        <Tile key={t.key} t={t} loading={rich.loading} rich={rich} className="w-[70%] shrink-0 snap-start" />
      ))}
    </div>
  );
}

/** Phone, pages without a slate header: insight + chips on the page. */
export function ListBannerPhoneOnPage({ rich }: { rich: RichBanner }) {
  return (
    <div className="space-y-3 md:hidden">
      {!rich.loading && <p className="text-sm text-muted-foreground">{rich.insight}</p>}
      <Chips rich={rich} phone onPage />
      <ListBannerPhoneTiles rich={rich} />
    </div>
  );
}

/** Beside the page's own filters: which banner chip is filtering the list,
 *  with a way to clear it (the banner may be scrolled out of view). */
export function ActiveChipNote({ rich, className }: { rich: RichBanner; className?: string }) {
  const c = rich.chips?.find((x) => x.key === rich.activeChip);
  if (!c) return null;
  return (
    <button
      type="button"
      onClick={() => rich.onChip?.(null)}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      Showing {c.count} {c.label}
      <X className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">— clear</span>
    </button>
  );
}

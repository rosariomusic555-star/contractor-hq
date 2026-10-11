import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CalendarCheck, ChevronDown, CircleAlert, LayoutDashboard, Plus, Settings2, TrendingUp, Wallet, X } from "lucide-react";
import { BleedBanner } from "@/components/common/BleedBanner";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WEATHER_ICON, useWeatherStrip } from "@/components/dashboard/useWeatherStrip";
import { useNeedsYouItems } from "@/components/dashboard/useNeedsYouItems";
import { useGreeting } from "@/hooks/use-greeting";
import { useDismissed } from "@/hooks/use-dismissed";
import { useAuth } from "@/lib/auth";
import { getBusinessProfile, listProjects } from "@/lib/api";
import { isoDate } from "@/lib/weatherRisk";
import { cn, pluralize } from "@/lib/utils";
import { useHeadlineCells } from "./headline";
import { jobsOnDay } from "./todayJobs";

const ON_BANNER_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-1 rounded-[0.625rem] border border-white/60 bg-transparent px-3.5 text-sm font-semibold text-banner-foreground transition-colors hover:bg-black/15 disabled:opacity-60 " +
  ON_BANNER_RING;
// New opportunity: the brand light green with ink text (primary-light) —
// same size and radius as the outlined banner buttons.
const PRIMARY = cn(buttonVariants({ variant: "primary-light" }), "h-10 gap-1.5 rounded-[0.625rem] px-4 focus-visible:ring-white/80 focus-visible:ring-offset-0");

export interface DashboardActions {
  onNewOpportunity: () => void;
  onNewQuote: () => void;
  onNewInvoice: () => void;
  onRecordPayment: () => void;
  quotePending?: boolean;
  invoicePending?: boolean;
}

/**
 * The Dashboard's banner (owner) — the project page's full-bleed slate
 * banner, for the day: greeting, date + a status line (jobs today, things
 * that need you), today's weather at the business address, quick actions,
 * and the headline numbers as tiles (moved here from the strip, so they're
 * never shown twice). Scrolls away with the page.
 */
export function DashboardBanner({
  actions,
  showTiles,
  onCustomize,
  onEditLayout,
}: {
  actions: DashboardActions;
  showTiles: boolean;
  onCustomize: () => void;
  /** Turns on Edit layout (simplified layout only; hidden while editing). */
  onEditLayout?: () => void;
}) {
  const { greeting, firstName, hasName, isLoading: nameLoading } = useGreeting();
  const { session } = useAuth();
  const [nameDismissed, dismissName] = useDismissed(`chq-name-prompt-dismissed:${session?.user.id ?? ""}`);
  const askName = !nameLoading && !hasName && !nameDismissed;
  const today = isoDate(new Date());
  const { data: profile, isLoading: profileLoading } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { items: needs, isLoading: needsLoading } = useNeedsYouItems();
  const { days } = useWeatherStrip();
  const weather = days?.find((d) => d.date === today) ?? null;
  const WeatherIcon = weather ? WEATHER_ICON[weather.icon] : null;

  const jobCount = jobsOnDay(projects, today).length;
  const setUp = !!profile?.company_name?.trim();
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const secondaryItems = (
    <>
      <DropdownMenuItem className="min-h-10 font-semibold" disabled={actions.quotePending} onSelect={actions.onNewQuote}>
        New quote
      </DropdownMenuItem>
      <DropdownMenuItem className="min-h-10 font-semibold" disabled={actions.invoicePending} onSelect={actions.onNewInvoice}>
        New invoice
      </DropdownMenuItem>
      <DropdownMenuItem className="min-h-10 font-semibold" onSelect={actions.onRecordPayment}>
        Record payment
      </DropdownMenuItem>
    </>
  );

  return (
    // The tiles sit outside the banner (its full-bleed background clips
    // anything past its edge): the banner gets extra bottom room of half a
    // tile, and the tile row is pulled up by the same amount, so the banner's
    // edge runs through the tiles' middle.
    <div>
    {/* Room above the greeting (16 / 20px). */}
    <BleedBanner label="Today" className={cn("pt-4 md:pt-5", showTiles && "pb-[80px] md:pb-[84px]")}>
      {/* Desktop (lg+): greeting left, actions right on the same row (the
          greeting gives way — the name truncates, the status line wraps).
          Narrower: the actions drop below the greeting. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        {/* Greeting + the day */}
        <div className="min-w-0 max-w-full lg:flex-1">
          {/* 26px on phones up to 36px on wide screens; one line — a long
              name ends in "…" rather than wrapping. */}
          <p className="mb-1 text-[13px] font-semibold text-banner-foreground/80 md:text-sm">{dateLabel}</p>
          <h1 className="truncate text-[length:clamp(26px,2.4vw,36px)] font-extrabold leading-[1.1] tracking-[-0.02em]">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px] font-semibold md:text-base">
            {askName && (
              <span className="inline-flex items-center gap-1">
                <Link to="/settings/profile" className={cn("underline-offset-2 hover:underline", ON_BANNER_RING)}>
                  Add your name →
                </Link>
                <button type="button" onClick={dismissName} className={cn("-my-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/15", ON_BANNER_RING)} aria-label="Dismiss: add your name">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span aria-hidden>·</span>
              </span>
            )}
            {!profileLoading && !setUp ? (
              <>
                <Link to="/settings/business-profile" className={cn("underline-offset-2 hover:underline", ON_BANNER_RING)}>
                  Finish setting up your company →
                </Link>
              </>
            ) : (
              <>
                <span>{jobCount === 0 ? "No jobs scheduled today" : `${pluralize(jobCount, "job")} scheduled today`}</span>
                {!needsLoading && (
                  <>
                    <span aria-hidden>·</span>
                    <Link to="/needs-you" className={cn("underline-offset-2 hover:underline", ON_BANNER_RING)}>
                      {needs.length === 0 ? "Nothing needs you" : `${needs.length} ${needs.length === 1 ? "thing needs" : "things need"} you`}
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
          {weather && WeatherIcon && (
            <Link
              to="/bookings"
              className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/[0.18] px-2.5 py-1 text-xs font-semibold hover:bg-black/25", ON_BANNER_RING)}
              title={weather.conditionLabel}
            >
              <WeatherIcon className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">
                {weather.tempMaxF}° · {weather.precipProbability}% rain
              </span>
              <span className="sr-only">today, {weather.conditionLabel}</span>
            </Link>
          )}
        </div>

        {/* Quick actions — desktop: all four (wide) or primary + "New ▾" */}
        {/* Centered on the greeting line (not the whole block): offset by half
            of (greeting line height − 40px button). */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex lg:mt-[calc((clamp(26px,2.4vw,36px)*1.1-2.5rem)/2)]">
          <button type="button" className={PRIMARY} onClick={actions.onNewOpportunity}>
            <Plus className="h-4 w-4" /> New opportunity
          </button>
          <div className="hidden items-center gap-2 xl:flex">
            <button type="button" className={SECONDARY} disabled={actions.quotePending} onClick={actions.onNewQuote}>
              New quote
            </button>
            <button type="button" className={SECONDARY} disabled={actions.invoicePending} onClick={actions.onNewInvoice}>
              New invoice
            </button>
            <button type="button" className={SECONDARY} onClick={actions.onRecordPayment}>
              Record payment
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(SECONDARY, "xl:hidden")}>
                <Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {secondaryItems}
            </DropdownMenuContent>
          </DropdownMenu>
          {onEditLayout && (
            <button type="button" onClick={onEditLayout} className={cn(SECONDARY, "border-transparent px-2.5 hover:bg-white/15")}>
              <LayoutDashboard className="h-4 w-4" /> Edit layout
            </button>
          )}
          <button type="button" aria-label="Customize dashboard" onClick={onCustomize} className={cn("flex h-10 w-10 items-center justify-center rounded-[0.625rem] hover:bg-white/15", ON_BANNER_RING)}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {/* Phones / tablets: New opportunity full width + a "+" menu for the rest */}
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" className={cn(PRIMARY, "h-11 flex-1")} onClick={actions.onNewOpportunity}>
            <Plus className="h-4 w-4" /> New opportunity
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More new…" className={cn(SECONDARY, "h-11 w-11 px-0")}>
                <Plus className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {secondaryItems}
            </DropdownMenuContent>
          </DropdownMenu>
          {onEditLayout && (
            <button type="button" aria-label="Edit layout" title="Edit layout" onClick={onEditLayout} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.625rem] hover:bg-white/15", ON_BANNER_RING)}>
              <LayoutDashboard className="h-4 w-4" />
            </button>
          )}
          <button type="button" aria-label="Customize dashboard" onClick={onCustomize} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.625rem] hover:bg-white/15", ON_BANNER_RING)}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

    </BleedBanner>
    {showTiles && <HeadlineTiles />}
    </div>
  );
}

const TILE_ICON = [Wallet, CircleAlert, CalendarCheck, TrendingUp, Banknote] as const;

/** The headline numbers as white tiles straddling the banner's bottom edge
 *  (top half on the slate, bottom half on the page): five across on desktop,
 *  3 + 2 on tablets (the first row straddles, the second sits below), a
 *  swipeable row on a phone with the next tile peeking in. Each links to its
 *  page. Height is fixed (120 / 128px) so the banner's extra bottom room —
 *  half a tile — lines up exactly. */
function HeadlineTiles() {
  const { cells, isLoading } = useHeadlineCells();
  return (
    // Phone: the scroller pads top/bottom so the tiles' shadow isn't clipped
    // (overflow-x clips vertically too); the pull-up includes that padding.
    <div className="relative z-[1] -mx-4 -mt-[68px] flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-2 md:mx-0 md:-mt-16 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:p-0 lg:grid-cols-5">
      {cells.map((x, n) => {
        const Icon = TILE_ICON[n] ?? Wallet;
        return (
          <Link
            key={x.label}
            to={x.to}
            className="group flex h-[120px] w-[70%] shrink-0 snap-start flex-col rounded-card border border-border bg-card px-4 py-3.5 text-foreground shadow-card transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-32 md:w-auto md:px-5 md:py-4"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 min-w-0 pt-0.5 text-xs font-semibold leading-4 text-muted-foreground">{x.label}</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-success" aria-hidden>
                <Icon className="h-3.5 w-3.5" />
              </span>
            </span>
            {isLoading ? (
              <span className="mt-auto block h-7 w-20 animate-pulse rounded bg-muted" />
            ) : (
              <span className={cn("mt-auto block truncate text-[26px] font-extrabold leading-tight tabular-nums md:text-[28px]", x.alert && "text-destructive")}>{x.value}</span>
            )}
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{x.sub || "\u00a0"}</span>
          </Link>
        );
      })}
    </div>
  );
}


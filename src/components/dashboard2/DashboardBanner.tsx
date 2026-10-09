import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import { BleedBanner } from "@/components/common/BleedBanner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WEATHER_ICON, useWeatherStrip } from "@/components/dashboard/useWeatherStrip";
import { useNeedsYouItems } from "@/components/dashboard/useNeedsYouItems";
import { useGreeting } from "@/hooks/use-greeting";
import { getBusinessProfile, listProjects } from "@/lib/api";
import { isoDate } from "@/lib/weatherRisk";
import { cn, pluralize } from "@/lib/utils";
import { useHeadlineCells } from "./headline";
import { jobsOnDay } from "./todayJobs";

const ON_BANNER_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-1 rounded-[0.625rem] border border-white/60 bg-transparent px-3.5 text-sm font-semibold text-banner-foreground transition-colors hover:bg-black/15 disabled:opacity-60 " +
  ON_BANNER_RING;
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-[0.625rem] bg-banner-control px-4 text-sm font-bold text-banner-control-foreground transition-colors hover:bg-white/90 " +
  ON_BANNER_RING;

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
export function DashboardBanner({ actions, showTiles, onCustomize }: { actions: DashboardActions; showTiles: boolean; onCustomize: () => void }) {
  const { greeting, firstName } = useGreeting();
  const today = isoDate(new Date());
  const { data: profile, isLoading: profileLoading } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { items: needs, isLoading: needsLoading } = useNeedsYouItems();
  const { days } = useWeatherStrip();
  const weather = days?.find((d) => d.date === today) ?? null;
  const WeatherIcon = weather ? WEATHER_ICON[weather.icon] : null;

  const jobCount = jobsOnDay(projects, today).length;
  const setUp = !!profile?.company_name?.trim();
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

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
    // Room above the greeting (16 / 20px); see HeadlineTiles for the gap
    // below it.
    <BleedBanner label="Today" className="pt-4 md:pt-5">
      {/* Desktop (lg+): greeting left, actions right on the same row (the
          greeting gives way — the name truncates, the status line wraps).
          Narrower: the actions drop below the greeting. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        {/* Greeting + the day */}
        <div className="min-w-0 max-w-full lg:flex-1">
          {/* 26px on phones up to 36px on wide screens; one line — a long
              name ends in "…" rather than wrapping. */}
          <h1 className="truncate text-[length:clamp(26px,2.4vw,36px)] font-extrabold leading-[1.1] tracking-[-0.02em]">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px] font-semibold md:text-base">
            <span>{dateLabel}</span>
            {!profileLoading && !setUp ? (
              <>
                <span aria-hidden>·</span>
                <Link to="/settings/business-profile" className={cn("underline-offset-2 hover:underline", ON_BANNER_RING)}>
                  Finish setting up your company →
                </Link>
              </>
            ) : (
              <>
                <span aria-hidden>·</span>
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
          <button type="button" aria-label="Customize dashboard" onClick={onCustomize} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.625rem] hover:bg-white/15", ON_BANNER_RING)}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showTiles && <HeadlineTiles />}
    </BleedBanner>
  );
}

/** The headline numbers as translucent tiles on the banner — swipeable on
 *  a phone, five across on desktop, each linking to its page. */
function HeadlineTiles() {
  const { cells, isLoading } = useHeadlineCells();
  return (
    <div className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:mt-5 md:grid md:grid-cols-5 md:overflow-visible md:scroll-px-0 md:px-0">
      {cells.map((x) => (
        <Link
          key={x.label}
          to={x.to}
          className={cn("min-w-[9.5rem] snap-start rounded-xl bg-black/[0.18] px-3 py-2.5 transition-colors hover:bg-black/25 md:min-w-0", ON_BANNER_RING)}
        >
          <span className="block text-[11px] font-semibold">{x.label}</span>
          {isLoading ? (
            <span className="mt-1 block h-6 w-16 animate-pulse rounded bg-white/20" />
          ) : (
            <span className="block text-lg font-extrabold tabular-nums">{x.value}</span>
          )}
          <span className="block truncate text-[11px] font-semibold">{x.sub || " "}</span>
        </Link>
      ))}
    </div>
  );
}

import { AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayISO, useProjectForecast, type ForecastStatus } from "@/lib/forecast";
import { forecastWorkDays, formatInches, type Forecast, type WeatherSettings } from "@/lib/weatherRisk";
import { WeatherDayPopover } from "./WeatherDayPopover";
import { WeatherIcon } from "./WeatherIcon";
import { RISK_TEXT, RISK_TILE } from "./riskStyles";

const STATUS_NOTE: Record<Exclude<ForecastStatus, "ok">, string> = {
  no_address: "Add a valid address to see the forecast.",
  geocode_failed: "Add a valid address to see the forecast.",
  unsupported: "The forecast covers US addresses only.",
  unavailable: "Forecast unavailable right now — try again later.",
};

export function ForecastNote({ status, className }: { status: Exclude<ForecastStatus, "ok">; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {(status === "no_address" || status === "geocode_failed") && <MapPin className="h-3.5 w-3.5 shrink-0" />}
      {STATUS_NOTE[status]}
    </p>
  );
}

/**
 * Forecast on the schedule (0119) — a compact strip of a job's upcoming
 * work days within the forecast range: icon, rain chance (crew hours) +
 * amount, high temp. Risky days are tinted amber/red with a flag; tap any
 * day for the details. Scrolls sideways inside its card on phones. Weather
 * only — no prices, so the crew view uses it as-is.
 */
export function ProjectForecastStrip({
  projectId,
  start,
  end,
  className,
}: {
  projectId: string;
  start: string | null;
  end: string | null;
  className?: string;
}) {
  const { data: batch, isLoading } = useProjectForecast(projectId, !!start);
  if (!start) return null;
  if (isLoading) return <p className={cn("text-xs text-muted-foreground", className)}>Loading forecast…</p>;

  const target = batch?.projects[projectId];
  const status: ForecastStatus = target?.status ?? "unavailable";
  if (status !== "ok" || !target?.forecast || !batch) return <ForecastNote status={status === "ok" ? "unavailable" : status} className={className} />;

  return <ForecastDays projectId={projectId} start={start} end={end} forecast={target.forecast} settings={batch.settings} className={className} />;
}

function ForecastDays({
  projectId,
  start,
  end,
  forecast,
  settings,
  className,
}: {
  projectId: string;
  start: string;
  end: string | null;
  forecast: Forecast;
  settings: WeatherSettings;
  className?: string;
}) {
  const today = todayISO();
  const days = forecastWorkDays({ start, end }, forecast, settings, today);
  const lastDay = end && end >= start ? end : start;

  if (days.length === 0) {
    const note =
      lastDay < today
        ? null
        : start > (forecast.days[forecast.days.length - 1]?.date ?? today)
          ? "Forecast shows once work days are within about a week."
          : "No work days left in the forecast range.";
    return note ? <p className={cn("text-xs text-muted-foreground", className)}>{note}</p> : null;
  }

  return (
    <div className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)} data-testid="forecast-strip">
      {days.map(({ date, weather, risk }) => {
        const d = new Date(`${date}T00:00:00`);
        return (
          <WeatherDayPopover
            key={date}
            weather={weather}
            risk={risk}
            projectId={projectId}
            className={cn(
              "flex min-w-[68px] shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center transition-colors hover:brightness-95",
              RISK_TILE[risk.level],
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-subtle">
              {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getMonth() + 1}/{d.getDate()}
            </span>
            <span className="relative">
              <WeatherIcon condition={weather.condition} className={cn("h-5 w-5", RISK_TEXT[risk.level])} />
              {risk.level !== "none" && (
                <AlertTriangle className={cn("absolute -right-2.5 -top-1 h-3 w-3", RISK_TEXT[risk.level])} aria-label="Weather risk" />
              )}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", risk.level === "none" ? "text-foreground" : RISK_TEXT[risk.level])}>
              {weather.pop}%
            </span>
            <span className="min-h-[14px] text-[10px] tabular-nums text-muted-foreground">
              {weather.rainIn >= 0.01 ? `${formatInches(weather.rainIn)} in` : " "}
            </span>
            {weather.highF != null && <span className="text-xs font-semibold tabular-nums text-foreground">{weather.highF}°</span>}
          </WeatherDayPopover>
        );
      })}
    </div>
  );
}

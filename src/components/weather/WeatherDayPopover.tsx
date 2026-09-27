import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatInches, shortDayLabel, type DayRisk, type DayWeather } from "@/lib/weatherRisk";
import { WeatherIcon } from "./WeatherIcon";
import { RISK_TEXT } from "./riskStyles";

/**
 * Placeholder for the next feature — the "Push job" rain-delay action on a
 * flagged work day. It will get the job and the flagged date from here
 * (see riskyWorkDays() in src/lib/weatherRisk.ts for the list it will act
 * on). Deliberately renders nothing until that feature is built.
 */
export function PushJobSlot(_props: { projectId: string; date: string }) {
  return null;
}

/**
 * Tap/click a forecast day (strip tile, calendar cell, flag) to see why it's
 * flagged — a popover rather than a hover tooltip so it works on phones.
 */
export function WeatherDayPopover({
  weather,
  risk,
  projectId,
  title,
  children,
  className,
}: {
  weather: DayWeather;
  risk: DayRisk;
  /** Set on a job's work day — where the Push job action will attach. */
  projectId?: string;
  /** Overrides the "Thu 10/2" heading (e.g. an appointment's time). */
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={className} aria-label={`Forecast ${shortDayLabel(weather.date)}${risk.level !== "none" ? ` — ${risk.summary}` : ""}`}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-sm" align="center">
        <div className="flex items-center gap-2">
          <WeatherIcon condition={weather.condition} className={cn("h-5 w-5", RISK_TEXT[risk.level])} />
          <div className="min-w-0">
            <p className="font-bold text-foreground">{title ?? shortDayLabel(weather.date)}</p>
            <p className="text-xs text-muted-foreground">{weather.label}</p>
          </div>
        </div>
        {risk.level !== "none" && (
          <ul className="mt-2 space-y-1">
            {risk.reasons.map((r) => (
              <li key={r} className={cn("flex items-start gap-1.5 text-xs font-semibold", RISK_TEXT[risk.level])}>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {weather.pop}% chance of rain{weather.rainIn >= 0.01 ? ` · ~${formatInches(weather.rainIn)} in` : ""}
          {weather.highF != null && ` · High ${weather.highF}°F`}
          {weather.lowF != null && ` / Low ${weather.lowF}°F`}
        </p>
        {projectId && risk.level !== "none" && <PushJobSlot projectId={projectId} date={weather.date} />}
      </PopoverContent>
    </Popover>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBusinessProfile } from "@/lib/api";
import { getWeatherStrip, DEFAULT_WORK_WINDOW, type WeatherIconKey, type WorkWindow } from "@/lib/weather";

const ICON: Record<WeatherIconKey, typeof Sun> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};

const FLAG_LABEL: Record<"rain" | "cold", string> = {
  rain: "Rain risk during work hours — install-critical",
  cold: "Won't clear 40°F — adhesive/polymeric sand won't cure",
};

/**
 * Compact 7-day forecast strip. Rain stops hardscape work outright (base
 * can't compact in mud) and polymeric sand/adhesive need a dry, ~40F+ cure
 * window, so days that fail either are flagged. The headline rain % (and
 * the flag itself) is scoped to Settings > Business profile's crew work
 * window, not the full day — see getWeatherStrip()'s own doc comment.
 * Geocoded from Settings > Business profile's address; hidden entirely
 * (not an error state) if no address is set or the API/geocode fails.
 */
export function WeatherStrip({ className }: { className?: string }) {
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const address = profile?.address?.trim() || null;
  const workWindow: WorkWindow = profile
    ? { start: profile.crew_start_time, end: profile.crew_end_time }
    : DEFAULT_WORK_WINDOW;

  const { data: days } = useQuery({
    queryKey: ["weather-strip", address, workWindow.start, workWindow.end],
    queryFn: () => getWeatherStrip(address as string, workWindow),
    enabled: !!address,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (!address || !days || days.length === 0) return null;

  return (
    <section
      className={cn(
        "card-surface flex items-stretch gap-2 overflow-x-auto p-3 md:grid md:grid-cols-7 md:gap-3 md:overflow-visible",
        className,
      )}
    >
      {days.map((d) => {
        const Icon = ICON[d.icon];
        return (
          <div
            key={d.date}
            className={cn(
              "flex min-w-[80px] shrink-0 flex-col items-center gap-1 rounded-xl px-2.5 py-2.5 text-center md:min-w-0",
              d.flagged ? "bg-destructive/10" : "bg-muted/40",
            )}
            title={d.flagReason ? FLAG_LABEL[d.flagReason] : d.conditionLabel}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{d.dayLabel}</p>
            <Icon className={cn("h-5 w-5", d.flagged ? "text-destructive" : "text-muted-foreground")} />
            <p className="text-sm font-bold tabular-nums text-foreground">
              {d.tempMaxF}° <span className="font-semibold text-muted-foreground">{d.tempMinF}°</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{d.precipProbability}% rain</p>
            {/* Fixed-height slot so tiles stay equal height whether or not
                a qualifier line is present. */}
            <p className="min-h-[13px] text-[10px] leading-tight text-muted-subtle">
              {d.rainQualifier ?? " "}
            </p>
            {d.flagged && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />}
          </div>
        );
      })}
    </section>
  );
}

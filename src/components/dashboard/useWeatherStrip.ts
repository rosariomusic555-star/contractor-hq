import { useQuery } from "@tanstack/react-query";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog } from "lucide-react";
import { getBusinessProfile } from "@/lib/api";
import { getWeatherStrip, DEFAULT_WORK_WINDOW, type WeatherIconKey, type WorkWindow } from "@/lib/weather";

export const WEATHER_ICON: Record<WeatherIconKey, typeof Sun> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};

/** The 7-day strip's data — one cached fetch (by business address + crew
 *  hours), shared with the Dashboard banner's "today" weather. */
export function useWeatherStrip() {
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
  return { address, days };
}

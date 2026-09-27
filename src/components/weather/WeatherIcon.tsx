import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONDITION_LABEL, type WeatherCondition } from "@/lib/weatherRisk";

const ICON: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  showers: CloudRain,
  thunderstorms: CloudLightning,
  snow: CloudSnow,
  freezing_rain: CloudHail,
};

/** Forecast on the schedule (0119) — one small, consistent icon set. */
export function WeatherIcon({ condition, className }: { condition: WeatherCondition; className?: string }) {
  const Icon = ICON[condition] ?? Cloud;
  return <Icon className={cn("h-4 w-4", className)} aria-label={CONDITION_LABEL[condition]} />;
}

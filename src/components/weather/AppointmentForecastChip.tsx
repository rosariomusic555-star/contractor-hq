import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppointmentForecasts } from "@/lib/forecast";
import { appointmentWeather } from "@/lib/weatherRisk";
import { SITE_VISIT_APPOINTMENT_TYPES, type Appointment } from "@/lib/api";
import { WeatherDayPopover } from "./WeatherDayPopover";
import { WeatherIcon } from "./WeatherIcon";
import { RISK_TEXT } from "./riskStyles";

/**
 * Forecast on the schedule (0119) — a small chip on an upcoming appointment
 * inside the forecast range: the rain chance for the appointment's own time
 * (or the crew's hours for an all-day visit) and the high. Tap for details.
 * Every row shares one batched request (useAppointmentForecasts).
 */
export function AppointmentForecastChip({
  appointment,
  interactive = true,
  className,
}: {
  appointment: Appointment;
  /** False inside an element that's already a button (the dashboard card's
   * rows) — renders a plain chip with the reason as its title instead. */
  interactive?: boolean;
  className?: string;
}) {
  const batch = useAppointmentForecasts();
  if (appointment.status !== "scheduled" || !SITE_VISIT_APPOINTMENT_TYPES.includes(appointment.type)) return null;
  const target = batch?.appointments[appointment.id];
  if (!target?.forecast || !batch) return null;
  const r = appointmentWeather(appointment, target.forecast, batch.settings);
  if (!r) return null;
  const { weather, risk } = r;
  const when = new Date(appointment.date_time);
  const title = `${when.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}${
    appointment.all_day ? " · crew hours" : ` · ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  }`;
  const chipClass = cn(
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
    risk.level === "none" ? "bg-muted text-muted-foreground" : risk.level === "amber" ? "bg-warning-strong/15 text-warning" : "bg-destructive/10 text-destructive",
    className,
  );
  const content = (
    <>
      <WeatherIcon condition={weather.condition} className={cn("h-3.5 w-3.5", RISK_TEXT[risk.level])} />
      {weather.pop}%{weather.highF != null && ` · ${weather.highF}°`}
      {risk.level !== "none" && <AlertTriangle className="h-3 w-3" aria-label="Weather risk" />}
    </>
  );
  if (!interactive) {
    return (
      <span className={chipClass} title={risk.summary || `${weather.label} · ${weather.pop}% chance of rain`}>
        {content}
      </span>
    );
  }
  return (
    <WeatherDayPopover weather={weather} risk={risk} title={title} className={chipClass}>
      {content}
    </WeatherDayPopover>
  );
}

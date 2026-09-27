import { Link } from "react-router-dom";
import { AlertTriangle, CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRainDelay } from "@/components/schedule/rainDelayContext";
import { cn } from "@/lib/utils";
import { jobRisks, useScheduleForecasts } from "@/lib/forecast";
import { RISK_TEXT } from "@/components/weather/riskStyles";

const DAYS = 7;

/**
 * Forecast on the schedule (0119) — "Upcoming weather risks": scheduled
 * jobs with a flagged work day in the next 7 days, e.g. "Greg Patio · Thu
 * 10/2: 80% chance of rain, ~0.6 in". Hidden entirely when there are none.
 * Each row opens the job (its Schedule card has the day-by-day strip).
 */
export function WeatherRisksCard({ className }: { className?: string }) {
  const { projects, batch } = useScheduleForecasts();
  const risks = jobRisks(projects, batch, DAYS);
  const openDelay = useRainDelay();
  if (risks.length === 0) return null;

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Upcoming weather risks <span className="font-semibold text-muted-foreground">· next {DAYS} days</span>
      </h3>
      <ul className="mt-2 divide-y divide-hairline">
        {risks.map((r) => {
          const d = new Date(`${r.date}T00:00:00`);
          return (
            <li key={`${r.project.id}-${r.date}`} className="flex items-start gap-2">
              <Link to={`/projects/${r.project.id}`} className="-mx-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-2 text-sm transition-colors hover:bg-muted/50">
                <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", RISK_TEXT[r.level])} />
                <span className="min-w-0">
                  <span className="font-bold text-foreground">{r.project.name}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getMonth() + 1}/{d.getDate()}:{" "}
                  </span>
                  <span className={cn("font-semibold", RISK_TEXT[r.level])}>{r.summary}</span>
                </span>
              </Link>
              {openDelay && (
                <Button size="sm" variant="outline" className="mt-1 h-8 shrink-0 px-2.5 text-xs font-bold" onClick={() => openDelay({ projectId: r.project.id, date: r.date })}>
                  <CloudRain className="mr-1 h-3.5 w-3.5" />
                  Delay
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

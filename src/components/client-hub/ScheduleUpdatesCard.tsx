import { CalendarClock, CloudRain } from "lucide-react";
import type { PortalProjectDetail, PortalScheduleUpdate } from "@/lib/portalApi";
import { delayDayLabel } from "@/lib/scheduleShift";
import { scheduleUpdateHeadline } from "@/lib/hubDesktop";

const range = (s: string | null, e: string | null) => (e && e !== s ? `${delayDayLabel(s)} – ${delayDayLabel(e)}` : delayDayLabel(s));

/**
 * Client Hub (0121) — the latest schedule change at the top of the project
 * page, earlier ones under it. Built only from the whitelisted
 * `schedule_updates` (dates + rain / weather / schedule) — never notes,
 * internal reasons, crews or other clients' jobs.
 */
export function ScheduleUpdatesCard({ detail }: { detail: PortalProjectDetail }) {
  const updates = detail.schedule_updates ?? [];
  if (updates.length === 0) return null;
  const [latest, ...earlier] = updates;
  const Icon = latest.reason === "schedule" ? CalendarClock : CloudRain;
  return (
    <div className="card-surface border-l-4 border-l-info p-5">
      <p className="flex items-start gap-2 text-base font-bold text-foreground">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        {scheduleUpdateHeadline(latest)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        New dates: <span className="font-semibold text-foreground">{range(latest.to_start, latest.to_end)}</span>
        <span className="text-muted-subtle"> (was {range(latest.from_start, latest.from_end)})</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-subtle">
        Posted {new Date(latest.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      {earlier.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-hairline pt-2 text-xs text-muted-foreground">
          {earlier.slice(0, 4).map((u) => (
            <li key={u.id}>
              {new Date(u.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {scheduleUpdateHeadline(u).replace("Schedule update: ", "")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

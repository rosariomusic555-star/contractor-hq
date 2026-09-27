import { useQueries, useQuery } from "@tanstack/react-query";
import { listProjects, preconNotify, getPreconSettings, type Project } from "@/lib/api";
import { fetchPreconBundle, type PreconBundle } from "@/lib/preconSignals";
import { addDaysISO, isoDate, shortDayLabel } from "@/lib/weatherRisk";
import { locateCheck, locateExpiringSoon, openSummary, preconPhase } from "@/lib/precon";
import type { NeedsYouItem } from "@/lib/needsYou";

const STALE = 30_000;

/** One job's checklist + readiness. */
export function usePreconBundle(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["precon", projectId],
    queryFn: () => fetchPreconBundle(projectId as string),
    enabled: !!projectId && enabled,
    staleTime: STALE,
  });
}

/** Jobs that haven't started, starting within `days` (or already past their start). */
export function upcomingPreconProjects(projects: Project[], days: number, today = isoDate(new Date())): Project[] {
  const until = addDaysISO(today, days);
  return projects.filter(
    (p) => preconPhase(p) === "before" && !!p.scheduled_start_date && p.scheduled_start_date <= until,
  );
}

/** Bundles for every upcoming job (Needs you, Bookings). */
export function useUpcomingPrecon(days: number) {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const upcoming = upcomingPreconProjects(projects, days);
  const results = useQueries({
    queries: upcoming.map((p) => ({ queryKey: ["precon", p.id], queryFn: () => fetchPreconBundle(p.id), staleTime: STALE })),
  });
  return results.map((r) => r.data).filter(Boolean) as PreconBundle[];
}

/** Needs you: "Greg Patio starts Mon · 811 ticket and deposit still open". */
export function usePreconNeedsYou(): NeedsYouItem[] {
  const { data: settings } = useQuery({ queryKey: ["precon-settings"], queryFn: getPreconSettings });
  const bundles = useUpcomingPrecon(settings?.warn_days ?? 5);
  return preconNeedsYouItems(bundles);
}

export function preconNeedsYouItems(bundles: PreconBundle[]): NeedsYouItem[] {
  return bundles
    .filter((b) => b.readiness.openRequired.length > 0 && b.readiness.daysToStart != null && b.readiness.daysToStart <= b.settings.warn_days)
    .map((b) => ({
      key: `precon-${b.project.id}`,
      tone: b.readiness.status === "blocked" ? ("red" as const) : ("grey" as const),
      title:
        b.readiness.daysToStart! < 0
          ? `${b.project.name} was due to start ${shortDayLabel(b.project.scheduled_start_date!)}`
          : `${b.project.name} starts ${b.readiness.daysToStart === 0 ? "today" : shortDayLabel(b.project.scheduled_start_date!).split(" ")[0]}`,
      subtitle: openSummary(b.readiness.openRequired),
      action: "Review",
      href: `/projects/${b.project.id}`,
      sortValue: Math.max(1, b.settings.warn_days - (b.readiness.daysToStart ?? 0) + 1),
    }));
}

/**
 * Daily (first app open): reminders + automations for jobs inside the
 * reminder window — required items open ("overdue"), all set ("ready"),
 * and 811 tickets about to run out. Deduped server-side per job + start date.
 */
export async function runPreconChecks(): Promise<number> {
  const settings = await getPreconSettings();
  const today = isoDate(new Date());
  const upcoming = upcomingPreconProjects(await listProjects(), settings.warn_days, today);
  let sent = 0;
  for (const p of upcoming) {
    const b = await fetchPreconBundle(p.id);
    const r = b.readiness;
    const start = p.scheduled_start_date!;
    if (r.openRequired.length) {
      if (await preconNotify(p.id, "overdue", `${p.name} starts ${shortDayLabel(start)}`, openSummary(r.openRequired), `${p.id}:overdue:${start}`)) sent++;
    } else if (await preconNotify(p.id, "ready", `${p.name} is ready to start`, `Starts ${shortDayLabel(start)} — every required item is done`, `${p.id}:ready:${start}`)) {
      sent++;
    }
    const locate = b.items.find((i) => i.kind === "locate" && !i.removed && i.status !== "na");
    if (locate) {
      const l = locateCheck(locate.details, { start, end: p.scheduled_end_date }, settings, today);
      if (locateExpiringSoon(l.expires, p.scheduled_end_date ?? start, today)) {
        if (await preconNotify(p.id, "locate_expiring", `811 ticket expiring · ${p.name}`, l.warnings[0] ?? "Refresh the 811 ticket", `${p.id}:811:${l.expires}`)) sent++;
      }
    }
  }
  return sent;
}

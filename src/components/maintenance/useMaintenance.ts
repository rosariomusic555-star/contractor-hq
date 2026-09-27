import { useQuery } from "@tanstack/react-query";
import { getMaintenanceSettings, listMaintenanceItems, listProjects, runMaintenanceChecksRpc, updateMaintenanceItem, type MaintenanceItem } from "@/lib/api";
import { maintenanceNeedsYou, needsMaintenanceSetup, rescheduleAfterDone } from "@/lib/maintenance";
import { isoDate } from "@/lib/weatherRisk";
import type { NeedsYouItem } from "@/lib/needsYou";

export const useMaintenanceItems = (projectId?: string) =>
  useQuery({ queryKey: ["maintenance-items", projectId ?? "all"], queryFn: () => listMaintenanceItems(projectId), staleTime: 30_000 });

export const useMaintenanceSettings = () => useQuery({ queryKey: ["maintenance-settings"], queryFn: getMaintenanceSettings });

/** Needs you (0127): "Set up maintenance for Greg Patio" (a day after
 * completion) and "Greg Gray: paver patio reseal due in April". */
export function useMaintenanceNeedsYou(): NeedsYouItem[] {
  const { data: items = [] } = useMaintenanceItems();
  const { data: settings } = useMaintenanceSettings();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const today = isoDate(new Date());

  const due = maintenanceNeedsYou(
    items.map((i) => ({
      ...i,
      projectName: i.project?.name ?? "Project",
      clientName: i.project?.client?.name ?? null,
      optedOut: !!i.project?.client?.maintenance_opt_out,
      completedAt: i.project?.completed_at ?? null,
      hasOpportunity: !!i.opportunity_id,
    })),
    settings?.lead_days ?? 30,
    today,
  );
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.project_id, (counts.get(i.project_id) ?? 0) + 1);
  const setup = projects
    .filter((p) => needsMaintenanceSetup(p, counts.get(p.id) ?? 0, today))
    .map((p) => ({
      key: `maint-setup-${p.id}`,
      tone: "grey" as const,
      title: `Set up maintenance reminders for ${p.name}`,
      subtitle: `${p.client?.name ?? "Client"} · bring them back for a reseal, inspection or tune-up`,
      action: "Set up",
      href: `/projects/${p.id}?maintenance=setup`,
      sortValue: 1,
    }));
  return [...due, ...setup];
}

/**
 * Daily (first app open): items whose maintenance job just completed get
 * their next date (the math lives in maintenance.ts), then the server makes
 * the due-soon tasks / notifications / automations (once per due date).
 */
export async function runMaintenanceChecks(): Promise<number> {
  await rescheduleFinished(await listMaintenanceItems());
  return runMaintenanceChecksRpc();
}

/** Items whose maintenance job just completed (the DB trigger clears
 * next_due) get their next date. Also run by the project card, so a job
 * completed after today's daily check doesn't sit at "Scheduling next…". */
export async function rescheduleFinished(items: MaintenanceItem[]): Promise<number> {
  let n = 0;
  for (const i of items) {
    if (i.status === "active" && !i.next_due && i.last_done_on && !i.as_needed && !i.opportunity_id) {
      const next = rescheduleAfterDone(i, i.last_done_on);
      if (next) {
        await updateMaintenanceItem(i.id, { next_due: next });
        n++;
      }
    }
  }
  return n;
}

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, MoreHorizontal, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addMaintenanceEvent,
  createMaintenanceOpportunity,
  dismissMaintenanceSetup,
  getBusinessProfile,
  listCategories,
  listFeatureWarranties,
  listProjectFeatures,
  logActivity,
  updateMaintenanceItem,
  type MaintenanceItem,
  type Project,
} from "@/lib/api";
import { featureName } from "@/lib/features";
import { addMonthsISO, intervalLabel, maintenanceMessage, monthYear, rescheduleAfterDone } from "@/lib/maintenance";
import { firstName } from "@/lib/messageTemplates";
import { isoDate } from "@/lib/weatherRisk";
import type { MessageChannel } from "@/lib/clientMessaging";
import { ClientMessageComposer } from "@/components/messaging/ClientMessageComposer";
import { MaintenanceSetupSheet } from "./MaintenanceSetupSheet";
import { rescheduleFinished, useMaintenanceItems } from "./useMaintenance";

const EVENT_LABEL: Record<string, string> = {
  set_up: "Reminder set up",
  reached_out: "Reached out",
  opportunity: "Opportunity created",
  client_request: "Client requested service",
  snoozed: "Snoozed",
  skipped: "Skipped this time",
  done: "Done",
  stopped: "Stopped",
};

const fmtDay = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Care & maintenance (0127) on a completed project: the reminders set up at
 * completion (next due, history) and warranty end dates, with the due-item
 * actions — Reach out, Create opportunity, Snooze 1/3 months, Skip, Done,
 * Stop. `?maintenance=setup` opens the setup sheet; `?maintenance=<item>`
 * opens Reach out for that item (Needs you links).
 */
export function MaintenanceCard({ project }: { project: Project }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data: items = [], isFetched } = useMaintenanceItems(project.id);
  const { data: features = [] } = useQuery({ queryKey: ["project-features", project.id], queryFn: () => listProjectFeatures(project.id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: warrantyRows = [] } = useQuery({ queryKey: ["feature-warranties", project.id], queryFn: () => listFeatureWarranties(project.id) });
  const [setupOpen, setSetupOpen] = useState(false);
  const [reachOut, setReachOut] = useState<MaintenanceItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const today = isoDate(new Date());

  // Needs you deep links.
  const param = params.get("maintenance");
  useEffect(() => {
    if (!param || !isFetched) return;
    if (param === "setup") setSetupOpen(true);
    else {
      const it = items.find((i) => i.id === param);
      if (it) setReachOut(it);
    }
    const next = new URLSearchParams(params);
    next.delete("maintenance");
    setParams(next, { replace: true });
  }, [param, isFetched, items, params, setParams]);

  // A maintenance job completed since the daily check → schedule the next one now.
  useEffect(() => {
    if (!items.some((i) => i.status === "active" && !i.next_due && i.last_done_on && !i.as_needed && !i.opportunity_id)) return;
    void rescheduleFinished(items).then((n) => n > 0 && qc.invalidateQueries({ queryKey: ["maintenance-items"] }));
  }, [items, qc]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["maintenance-items"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["feature-warranties", project.id] });
  };
  const onError = (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" });

  const act = useMutation({
    mutationFn: async ({ item, kind }: { item: MaintenanceItem; kind: "snooze1" | "snooze3" | "skip" | "done" | "stop" | "resume" }) => {
      const base = item.next_due && item.next_due > today ? item.next_due : today;
      if (kind === "snooze1" || kind === "snooze3") {
        const until = addMonthsISO(today, kind === "snooze1" ? 1 : 3);
        await updateMaintenanceItem(item.id, { snoozed_until: until });
        await addMaintenanceEvent(item.id, "snoozed", `Until ${fmtDay(until)}`);
      } else if (kind === "skip") {
        // Skip this occurrence: the next one counts from this due date.
        const next = rescheduleAfterDone(item, item.next_due ?? today);
        await updateMaintenanceItem(item.id, { next_due: next, snoozed_until: null });
        await addMaintenanceEvent(item.id, "skipped", next ? `Next: ${monthYear(next)}` : null);
      } else if (kind === "done") {
        const next = rescheduleAfterDone(item, today);
        await updateMaintenanceItem(item.id, { last_done_on: today, next_due: next, snoozed_until: null, opportunity_id: null });
        await addMaintenanceEvent(item.id, "done", next ? `Next: ${monthYear(next)}` : null);
      } else if (kind === "stop") {
        await updateMaintenanceItem(item.id, { status: "stopped" });
        await addMaintenanceEvent(item.id, "stopped");
      } else {
        await updateMaintenanceItem(item.id, { status: "active", next_due: item.next_due ?? rescheduleAfterDone(item, base) });
      }
    },
    onSuccess: refresh,
    onError,
  });

  const createOpp = useMutation({
    mutationFn: (itemIds: string[] | null) => createMaintenanceOpportunity(project.id, itemIds),
    onSuccess: (oppId) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      toast({ title: "Opportunity created", description: "It's in your pipeline with the client, address and features filled in." });
      return oppId;
    },
    onError,
  });

  const dismiss = useMutation({ mutationFn: () => dismissMaintenanceSetup(project.id), onSuccess: refresh, onError });

  const featureLabel = (id: string | null) => {
    const f = features.find((x) => x.id === id);
    return f ? featureName(f, categories) : null;
  };
  const warranties = warrantyRows.flatMap((w) => {
    const f = features.find((x) => x.id === w.id);
    return f ? [{ ...f, ends_on: w.warranty_ends_on }] : [];
  });
  const active = items.filter((i) => i.status === "active");
  const stopped = items.filter((i) => i.status === "stopped");
  const history = items
    .flatMap((i) => (i.events ?? []).map((e) => ({ ...e, label: i.label })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const optedOut = !!items[0]?.project?.client?.maintenance_opt_out;

  if (!isFetched) return null;

  return (
    <section className="card-surface p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Wrench className="h-4 w-4 text-muted-foreground" /> Care & maintenance
          </h3>
          {optedOut && <p className="mt-0.5 text-xs font-semibold text-warning">The client asked not to be reminded — you won't get due reminders.</p>}
        </div>
        {items.length > 0 && (
          <Button size="sm" variant="outline" className="h-9" onClick={() => setSetupOpen(true)}>
            Add
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            {project.maintenance_dismissed
              ? "No maintenance reminders for this job."
              : "Set reminders for a reseal, inspection or tune-up — past clients are your easiest repeat work."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" onClick={() => setSetupOpen(true)}>
              Add maintenance reminders
            </Button>
            {!project.maintenance_dismissed && (
              <Button variant="ghost" className="h-10 text-muted-foreground" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
                Not for this job
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {active.map((i) => {
            const snoozed = i.snoozed_until && i.snoozed_until > today ? i.snoozed_until : null;
            const overdue = !!i.next_due && i.next_due < today;
            return (
              <li key={i.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{i.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {[featureLabel(i.feature_id), intervalLabel({ ...i, interval_months_max: null })].filter(Boolean).join(" · ")}
                  </p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold", overdue ? "text-destructive" : "text-foreground")}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {i.as_needed ? "As needed" : i.next_due ? `${overdue ? "Was due" : "Next"}: ${monthYear(i.next_due)}` : "Scheduling next…"}
                    {snoozed && <span className="font-normal text-muted-foreground"> · snoozed until {fmtDay(snoozed)}</span>}
                  </p>
                  {i.opportunity_id && (
                    <Link to={`/pipeline/${i.opportunity_id}`} className="mt-0.5 inline-block text-xs font-semibold text-primary">
                      Opportunity open →
                    </Link>
                  )}
                </div>
                {!i.as_needed && (
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setReachOut(i)}>
                    Reach out
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`More for ${i.label}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!i.opportunity_id && <DropdownMenuItem onClick={() => createOpp.mutate([i.id])}>Create opportunity</DropdownMenuItem>}
                    {!i.as_needed && (
                      <>
                        <DropdownMenuItem onClick={() => act.mutate({ item: i, kind: "snooze1" })}>Snooze 1 month</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => act.mutate({ item: i, kind: "snooze3" })}>Snooze 3 months</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => act.mutate({ item: i, kind: "skip" })}>Skip this time</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => act.mutate({ item: i, kind: "done" })}>Mark done (schedule next)</DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => act.mutate({ item: i, kind: "stop" })}>
                      Stop reminders
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
          {stopped.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2.5 text-sm text-muted-foreground">
              <span className="flex-1 line-through">{i.label}</span>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => act.mutate({ item: i, kind: "resume" })}>
                Resume
              </Button>
            </li>
          ))}
        </ul>
      )}

      {warranties.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-hairline pt-3">
          {warranties.map((f) => (
            <p key={f.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {featureName(f, categories)} warranty until {fmtDay(f.ends_on)}
            </p>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-2">
          <button type="button" onClick={() => setHistoryOpen((o) => !o)} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            History ({history.length}) <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", historyOpen && "rotate-180")} />
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-1">
              {history.map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{fmtDay(e.created_at)}</span> · {e.label}: {EVENT_LABEL[e.kind] ?? e.kind}
                  {e.note && !/^[0-9a-f-]{36}$/.test(e.note) ? ` — ${e.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <MaintenanceSetupSheet project={project} open={setupOpen} onOpenChange={setSetupOpen} />
      <ReachOutDialog
        project={project}
        item={reachOut}
        featureLabel={reachOut ? featureLabel(reachOut.feature_id) : null}
        onClose={() => setReachOut(null)}
        onCreateOpportunity={(id) => createOpp.mutate([id])}
        onDone={refresh}
      />
    </section>
  );
}

/** Reach out: the prefilled message through the usual Text / Email / Copy,
 * then "Mark as sent?" → activity + history. */
function ReachOutDialog({
  project,
  item,
  featureLabel,
  onClose,
  onCreateOpportunity,
  onDone,
}: {
  project: Project;
  item: MaintenanceItem | null;
  featureLabel: string | null;
  onClose: () => void;
  onCreateOpportunity: (itemId: string) => void;
  onDone: () => void;
}) {
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!item) return;
    setMessage(
      maintenanceMessage({
        clientName: project.client?.name ?? null,
        companyName: profile?.company_name ?? null,
        featureLabel: featureLabel?.split(" · ")[0] ?? null,
        itemLabel: item.label,
        installedOn: (project.completed_at ?? project.actual_end_date)?.slice(0, 10) ?? null,
        today: isoDate(new Date()),
      }),
    );
  }, [item, project, profile, featureLabel]);

  const markSent = async (channel: MessageChannel) => {
    if (!item) return;
    await addMaintenanceEvent(item.id, "reached_out", channel);
    if (project.client_id) {
      await logActivity(project.client_id, channel === "copy" ? "note" : channel, `Maintenance reach-out (${item.label}): ${message}`, { project_id: project.id });
    }
    onDone();
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md space-y-3">
        <DialogHeader>
          <DialogTitle>Reach out to {firstName(project.client?.name)}</DialogTitle>
        </DialogHeader>
        {item && (
          <>
            <ClientMessageComposer
              message={message}
              onMessageChange={setMessage}
              subject={`${item.label} for your ${featureLabel?.split(" · ")[0]?.toLowerCase() ?? "project"}`}
              phone={project.client?.phone}
              email={project.client?.email}
              clientId={project.client_id}
              clientName={project.client?.name}
              onMarkSent={(ch) => void markSent(ch)}
              marking={false}
            />
            {!item.opportunity_id && (
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => {
                  onCreateOpportunity(item.id);
                  onClose();
                }}
              >
                They're in — create opportunity
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

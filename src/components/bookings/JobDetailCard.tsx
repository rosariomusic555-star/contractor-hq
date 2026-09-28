import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/common/StatusPill";
import { formatCurrency } from "@/lib/utils";
import { listProjects, listQuotes, listMaterialsSheets, pickHeadlineQuote, updateProject } from "@/lib/api";
import { projectStatusMeta } from "@/lib/statusMeta";
import type { BookingJob } from "@/lib/bookings";
import { ProjectForecastStrip } from "@/components/weather/ForecastStrip";
import { CrewSelect } from "@/components/schedule/CrewSelect";
import { ScheduleMenu } from "@/components/schedule/ScheduleMenu";
import { HeadsUpReminder } from "@/components/schedule/HeadsUpReminder";
import { PreconSummaryLine } from "@/components/precon/PreconSummaryLine";

/**
 * One job's full detail, as a card — the unit the Year view's side panel
 * (day mode or month mode) repeats for however many jobs are in scope.
 * Dates are editable inline: this view has no bars to resize, so date
 * changes happen here instead, through the same reschedule-with-undo path
 * as everything else.
 */
export function JobDetailCard({
  job,
  onDatesChange,
  onUnschedule,
}: {
  job: BookingJob;
  /** Only the field that changed — the other one is merged from the latest saved dates. */
  onDatesChange: (job: BookingJob, patch: { start?: string | null; end?: string | null }) => void;
  onUnschedule: (job: BookingJob) => void;
}) {
  const navigate = useNavigate();
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: job.projectId }],
    queryFn: () => listQuotes(job.projectId),
  });
  const { data: sheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: job.projectId }],
    queryFn: () => listMaterialsSheets(job.projectId),
  });

  const headlineQuote = pickHeadlineQuote(quotes);
  // Real crews (0120) — read from the shared projects list.
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const crewId = projects.find((p) => p.id === job.projectId)?.crew_id ?? null;
  const crewMut = useMutation({
    mutationFn: (id: string | null) => updateProject(job.projectId, { crew_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const meta = projectStatusMeta(job.status);

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-base font-bold text-foreground">{job.projectName}</p>
        <div className="flex shrink-0 items-center gap-1">
          <StatusPill meta={meta} />
          <ScheduleMenu projectId={job.projectId} start={job.startDate} end={job.endDate} />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{job.clientName ?? "No client"}</p>
      {job.scopeLabel && <p className="text-sm text-muted-foreground">{job.scopeLabel}</p>}
      <p className="mt-2 text-xl font-extrabold tabular-nums text-foreground">{formatCurrency(job.contractDollars)}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground">Start date</Label>
          <Input
            type="date"
            value={job.startDate ?? ""}
            onChange={(e) => onDatesChange(job, { start: e.target.value || null })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-muted-foreground">End date</Label>
          <Input
            type="date"
            min={job.startDate ?? undefined}
            value={job.endDate ?? ""}
            onChange={(e) => onDatesChange(job, { end: e.target.value || null })}
            className="h-9 text-sm"
          />
        </div>
      </div>

      <HeadsUpReminder projectId={job.projectId} />
      <PreconSummaryLine projectId={job.projectId} />

      <div className="mt-2 space-y-1">
        <Label className="text-[11px] font-semibold text-muted-foreground">Crew</Label>
        <CrewSelect value={crewId} onChange={(id) => crewMut.mutate(id)} className="h-9 text-sm" />
      </div>

      {/* Forecast on the schedule (0119) — this job's upcoming work days. */}
      {job.startDate && job.status !== "complete" && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Forecast</p>
          <ProjectForecastStrip projectId={job.projectId} start={job.startDate} end={job.endDate} />
        </div>
      )}

      {(headlineQuote || sheets.length > 0) && (
        <div className="mt-3 space-y-1 border-t border-hairline pt-3">
          {headlineQuote && (
            <Link to={`/quotes/${headlineQuote.id}`} className="block text-xs font-semibold text-primary hover:text-primary/80">
              View linked quote →
            </Link>
          )}
          {sheets.length > 0 && (
            <Link
              to={`/projects/${job.projectId}/materials/${sheets[0].id}`}
              className="block text-xs font-semibold text-primary hover:text-primary/80"
            >
              View cost plan →
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1 font-bold" onClick={() => navigate(`/projects/${job.projectId}`)}>
          Open project
        </Button>
        <Button size="sm" variant="outline" className="flex-1 font-bold" onClick={() => onUnschedule(job)}>
          Unschedule
        </Button>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImagePlus, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/time";
import { projectStatusMeta } from "@/lib/statusMeta";
import {
  getAssignedProject,
  listProjectImages,
  addProjectImage,
  getSignedImageUrls,
  listProjectNotes,
  addProjectNote,
  listEmployeeProjectSelections,
} from "@/lib/api";
import { BannerStatus, ProjectBanner } from "@/components/project-overview/ProjectBanner";
import { ProjectForecastStrip } from "@/components/weather/ForecastStrip";
import { ScheduleDelaysList } from "@/components/schedule/ScheduleDelaysList";
import { delayDayLabel } from "@/lib/scheduleShift";

/**
 * The whole of an employee's work on one project: upload photos, post a
 * free-text update, and see a combined feed of both — their own past
 * entries and, when a project has more than one employee, everyone
 * else's too (the feed queries by project_id only, not by viewer).
 */
export function EmployeeProjectDetailView() {
  const { id = "" } = useParams();
  const { data: selections = [] } = useQuery({
    queryKey: ["employee-project-selections", id],
    queryFn: () => listEmployeeProjectSelections(id),
    enabled: !!id,
  });
  const { employee } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["employee-assigned-project", id],
    queryFn: () => getAssignedProject(id),
  });
  const { data: images = [] } = useQuery({
    queryKey: ["project-images", id],
    queryFn: () => listProjectImages(id),
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["project-notes", id],
    queryFn: () => listProjectNotes(id),
  });

  const paths = images.map((i) => i.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["project-image-urls", id, images.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await addProjectImage(id, file, { uploadedByEmployeeId: employee!.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-images", id] }),
    onError,
  });

  const noteMut = useMutation({
    mutationFn: (body: string) => addProjectNote(id, employee!.id, employee!.name, body),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["project-notes", id] });
    },
    onError,
  });

  type FeedEntry =
    | { kind: "note"; id: string; created_at: string; body: string; authorName: string | null }
    | { kind: "photo"; id: string; created_at: string; url: string | undefined };

  const feed: FeedEntry[] = [
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      created_at: n.created_at,
      body: n.body,
      authorName: n.employee_name,
    })),
    ...images.map((img) => ({
      kind: "photo" as const,
      id: img.id,
      created_at: img.created_at,
      url: signedUrls[img.storage_path],
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (projectLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!project) return <p className="text-destructive">Couldn't load this project.</p>;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Same banner as the owner's project page — no prices for crews. */}
      <ProjectBanner
        backTo="/employee"
        backLabel="My projects"
        name={project.name}
        statusLabel={projectStatusMeta(project.status).label}
        address={project.address}
        statusControl={<BannerStatus label={projectStatusMeta(project.status).label} />}
      />

      {/* Crew work order (0125) — everything for the job site, no prices. */}
      <Link
        to={`/employee/projects/${project.id}/work-order`}
        className="flex min-h-[56px] items-center justify-between rounded-2xl bg-primary px-5 py-3 text-base font-bold text-primary-foreground"
      >
        Open work order <span aria-hidden>›</span>
      </Link>

      {/* Forecast on the schedule (0119) — weather only, no prices. */}
      {project.scheduled_start_date && project.status !== "complete" && (
        <div className="card-surface p-4">
          <h2 className="text-sm font-bold text-foreground">Schedule</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {delayDayLabel(project.scheduled_start_date)}
            {project.scheduled_end_date && project.scheduled_end_date !== project.scheduled_start_date
              ? ` – ${delayDayLabel(project.scheduled_end_date)}`
              : ""}
          </p>
          <ProjectForecastStrip projectId={project.id} start={project.scheduled_start_date} end={project.scheduled_end_date} />
          {/* Rain delay markers (0120) — read-only for the crew. */}
          <ScheduleDelaysList projectId={project.id} canUndo={false} className="mt-3" />
        </div>
      )}

      {/* Client selections (0115) — the approved choices only, no prices. */}
      {selections.length > 0 && (
        <div className="card-surface p-4">
          <h2 className="text-sm font-bold text-foreground">Client selections</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {selections.map((s, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {s.section} · {s.group}
                </span>
                <span className="text-right font-semibold text-foreground">{s.choices.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Post an update */}
      <div className="stat-card space-y-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write an update — progress, an issue on site, anything the office should know…"
          rows={3}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMut.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
          >
            {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploadMut.isPending ? "Uploading…" : "Add photos"}
          </button>
          <Button
            onClick={() => note.trim() && noteMut.mutate(note.trim())}
            disabled={!note.trim() || noteMut.isPending}
            className="font-bold"
          >
            <Send className="mr-2 h-4 w-4" />
            {noteMut.isPending ? "Posting…" : "Post update"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) uploadMut.mutate(files);
          }}
        />
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {feed.length === 0 && (
          <div className="card-surface p-10 text-center text-muted-foreground">
            No updates yet — be the first to post one.
          </div>
        )}
        {feed.map((entry) =>
          entry.kind === "note" ? (
            <div key={`note-${entry.id}`} className="card-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">{entry.authorName ?? "Team update"}</span>
                <span className="text-[11px] text-muted-subtle">{timeAgo(entry.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{entry.body}</p>
            </div>
          ) : (
            <div key={`photo-${entry.id}`} className="card-surface overflow-hidden p-0">
              {entry.url ? (
                <img src={entry.url} alt="" className="max-h-80 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center bg-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              <div className="p-2.5 text-[11px] text-muted-subtle">{timeAgo(entry.created_at)}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

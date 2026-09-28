import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, CloudRain, MessageSquare, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { portalCommentProgress, portalReactProgress, type PortalProjectDetail } from "@/lib/portalApi";
import { mergeFeed, milestoneTrackers } from "@/lib/progress";
import { delayDayLabel } from "@/lib/scheduleShift";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * Client Hub "Progress" (0126): a milestone tracker per feature, then the
 * feed — shared progress updates and schedule changes, newest first — with
 * photos (tap to enlarge), 👍 and comments; before/after per feature.
 * Built only from the whitelisted `progress` block. `interactive` is off
 * in the contractor's Client view (read-only preview).
 */
export function ProgressSection({
  detail,
  projectId,
  signUrls,
  interactive,
}: {
  detail: PortalProjectDetail;
  projectId: string;
  signUrls: (paths: string[]) => Promise<Record<string, string>>;
  interactive: boolean;
}) {
  const qc = useQueryClient();
  const progress = detail.progress;
  const updates = useMemo(() => progress?.updates ?? [], [progress]);
  const paths = useMemo(
    () => [...updates.flatMap((u) => u.photos), ...(progress?.before_after ?? []).flatMap((b) => [b.before, b.after])],
    [updates, progress],
  );
  const { data: urls = {} } = useQuery({ queryKey: ["hub-progress-urls", projectId, paths.join(",")], queryFn: () => signUrls(paths), enabled: paths.length > 0, staleTime: 30 * 60_000 });
  const [zoom, setZoom] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
    qc.invalidateQueries({ queryKey: ["client-view", projectId] });
  };
  const like = useMutation({ mutationFn: ({ id, on }: { id: string; on: boolean }) => portalReactProgress(id, on), onSuccess: refresh });

  if (!progress || (updates.length === 0 && progress.before_after.length === 0)) return null;
  const trackers = milestoneTrackers(progress.features, updates.map((u) => ({ feature_id: u.feature, milestone: u.milestone, date: u.date })), progress.milestone_presets);
  const feed = mergeFeed(updates, detail.schedule_updates ?? []);
  const featureLabel = (id: string | null) => progress.features.find((f) => f.id === id)?.label ?? null;

  return (
    <section className="card-surface space-y-4 p-5">
      <h3 className="text-base font-bold text-foreground">Progress</h3>

      {trackers.map((t) => (
        <div key={t.featureId} className="rounded-xl bg-muted/40 p-3">
          <p className="text-sm font-bold text-foreground">{t.label}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-success">{t.latest} ✓</span>
            {t.next ? ` → ${t.next} next` : " · all done"}
          </p>
          <div className="mt-2 flex gap-1">
            {t.steps.map((s) => (
              <span key={s.label} title={s.label} className={cn("h-1.5 flex-1 rounded-full", s.done ? "bg-success" : "bg-border")} />
            ))}
          </div>
        </div>
      ))}

      {progress.before_after.map((b) => (
        <BeforeAfterSlider key={`${b.feature}-${b.before}`} label={featureLabel(b.feature)} before={urls[b.before]} after={urls[b.after]} />
      ))}

      <ol className="space-y-4">
        {feed.map((f) =>
          f.kind === "schedule" ? (
            <li key={`s-${f.item.id}`} className="flex items-start gap-2 text-sm text-foreground">
              {f.item.reason === "schedule" ? <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-info" /> : <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-info" />}
              <span>
                <span className="block text-xs text-muted-foreground">{when(f.date)}</span>
                Schedule update: now {delayDayLabel(f.item.to_start)}
                {f.item.to_end && f.item.to_end !== f.item.to_start ? ` – ${delayDayLabel(f.item.to_end)}` : ""}
                {f.item.reason === "rain" ? " (rain)" : f.item.reason === "weather" ? " (weather)" : ""}
              </span>
            </li>
          ) : (
            <li key={f.item.id} className="space-y-2 border-t border-hairline pt-3">
              <p className="text-xs text-muted-foreground">
                {when(f.date)}
                {featureLabel(f.item.feature) ? ` · ${featureLabel(f.item.feature)}` : ""}
              </p>
              {f.item.milestone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-bold text-success">
                  <Check className="h-3 w-3" /> {f.item.milestone}
                </span>
              )}
              {f.item.text && <p className="text-base text-foreground">{f.item.text}</p>}
              {f.item.photos.length > 0 && (
                <div className={cn("grid gap-1.5", f.item.photos.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                  {f.item.photos.map((p) => (
                    <button key={p} type="button" onClick={() => urls[p] && setZoom(urls[p])} className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      {urls[p] && <img src={urls[p]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={f.item.liked ? "default" : "outline"}
                  className="h-9"
                  disabled={!interactive || like.isPending}
                  onClick={() => like.mutate({ id: f.item.id, on: !f.item.liked })}
                >
                  <ThumbsUp className="mr-1 h-4 w-4" /> {f.item.liked ? "Liked" : "👍"}
                </Button>
              </div>
              {f.item.comments.map((c, i) => (
                <p key={i} className={cn("rounded-lg px-3 py-2 text-sm", c.author === "client" ? "bg-muted" : "ml-6 bg-info/10")}>
                  <span className="font-semibold">{c.author === "client" ? "You" : "Contractor"}: </span>
                  {c.body}
                </p>
              ))}
              {interactive && <CommentBox updateId={f.item.id} onDone={refresh} />}
            </li>
          ),
        )}
      </ol>


      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl p-2">{zoom && <img src={zoom} alt="" className="max-h-[85vh] w-full object-contain" />}</DialogContent>
      </Dialog>
    </section>
  );
}

function CommentBox({ updateId, onDone }: { updateId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () => portalCommentProgress(updateId, body),
    onSuccess: () => {
      setBody("");
      setOpen(false);
      onDone();
    },
  });
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <MessageSquare className="h-4 w-4" /> Comment or ask a question
      </button>
    );
  return (
    <div className="space-y-1.5">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} autoFocus placeholder="Your comment or question" />
      <Button size="sm" className="h-10" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
        Send
      </Button>
    </div>
  );
}

/** Drag the handle (or tap either side) to compare before and after. */
function BeforeAfterSlider({ label, before, after }: { label: string | null; before?: string; after?: string }) {
  const [pos, setPos] = useState(50);
  if (!before || !after) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-bold text-foreground">{label ? `${label} — before & after` : "Before & after"}</p>
      <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-muted">
        <img src={after} alt="After" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={before} alt="Before" className="absolute inset-0 h-full object-cover" style={{ width: `${10000 / Math.max(pos, 1)}%`, maxWidth: "none" }} />
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[11px] font-bold text-white">Before</span>
        <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[11px] font-bold text-white">After</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Before / after"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ListOrdered, EyeOff, MessageSquare, Share2, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addPortfolioItem,
  deleteProgressUpdate,
  getBusinessProfile,
  getProgressSettings,
  getSignedImageUrls,
  listCategories,
  listProgressUpdates,
  listProjectFeatures,
  listProjectImages,
  logActivity,
  markProgressPrompted,
  replyToProgressComment,
  setPhotoBeforeAfter,
  setProgressUpdateShared,
  updateProgressNote,
  type Project,
  type ProgressUpdate,
} from "@/lib/api";
import { PROGRESS_MESSAGE, shouldPromptClient } from "@/lib/progress";
import { clientHubLink, fillTemplate, firstName } from "@/lib/messageTemplates";
import { ClientMessageComposer } from "@/components/messaging/ClientMessageComposer";
import { PostUpdateSheet, type PostFeature } from "./PostUpdateSheet";
import { MilestonesDialog } from "./MilestonesDialog";

const STATUS: Record<ProgressUpdate["status"], { label: string; tone: string }> = {
  shared: { label: "Shared", tone: "bg-success/10 text-success" },
  pending: { label: "Needs review", tone: "bg-warning-strong/15 text-warning" },
  internal: { label: "Internal", tone: "bg-muted text-muted-foreground" },
};

/**
 * Project page (0126): Post update, the crew's updates to review, the feed
 * (share / unshare / delete, client 👍 and comments with replies), and
 * Before & after (+ Save to portfolio, marketing OK).
 */
export function ProgressUpdatesCard({ project }: { project: Project }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [posting, setPosting] = useState(false);
  const [letKnow, setLetKnow] = useState(false);
  const [editingMilestones, setEditingMilestones] = useState(false);
  const { data: updates = [] } = useQuery({ queryKey: ["progress-updates", project.id], queryFn: () => listProgressUpdates(project.id) });
  const { data: projectFeatures = [] } = useQuery({ queryKey: ["project-features", project.id], queryFn: () => listProjectFeatures(project.id) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: settings } = useQuery({ queryKey: ["progress-settings"], queryFn: getProgressSettings });
  const features: PostFeature[] = projectFeatures
    .filter((f) => f.status === "active")
    .map((f) => {
      const cat = categories.find((c) => c.id === f.category_id)?.name ?? null;
      return { id: f.id, label: f.label || cat || "Feature", category: cat, milestones: f.milestones ?? null };
    });

  const paths = useMemo(() => updates.flatMap((u) => (u.photos ?? []).map((p) => p.storage_path)), [updates]);
  const { data: urls = {} } = useQuery({ queryKey: ["progress-urls", paths.join(",")], queryFn: () => getSignedImageUrls(paths), enabled: paths.length > 0, staleTime: 30 * 60_000 });

  const refresh = () => qc.invalidateQueries({ queryKey: ["progress-updates"] });
  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const afterShare = () => {
    if (settings && shouldPromptClient(settings.notify_mode, (project as Project & { progress_prompted_at?: string | null }).progress_prompted_at)) setLetKnow(true);
  };
  const share = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setProgressUpdateShared(id, on),
    onSuccess: (_d, v) => {
      refresh();
      if (v.on) afterShare();
    },
    onError,
  });
  const del = useMutation({ mutationFn: deleteProgressUpdate, onSuccess: refresh, onError });

  const pending = updates.filter((u) => u.status === "pending");
  const featureLabel = (id: string | null) => features.find((f) => f.id === id)?.label ?? null;

  return (
    <section className="card-surface space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Progress updates</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={() => setEditingMilestones(true)} disabled={features.length === 0}>
            <ListOrdered className="mr-1.5 h-4 w-4" /> Milestones
          </Button>
          <Button size="sm" className="h-9 font-bold" onClick={() => setPosting(true)}>
            <Camera className="mr-1.5 h-4 w-4" /> Post update
          </Button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning-strong/40 bg-warning-strong/5 p-3">
          <p className="text-sm font-bold text-foreground">Updates to review ({pending.length})</p>
          {pending.map((u) => (
            <ReviewRow key={u.id} update={u} urls={urls} featureLabel={featureLabel(u.feature_id)} onApprove={() => share.mutate({ id: u.id, on: true })} onInternal={() => share.mutate({ id: u.id, on: false })} />
          ))}
        </div>
      )}

      {updates.filter((u) => u.status !== "pending").length === 0 && pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet. Post photos from the job and share them in the client's Hub.</p>
      ) : (
        <ul className="space-y-3">
          {updates
            .filter((u) => u.status !== "pending")
            .map((u) => (
              <FeedRow
                key={u.id}
                update={u}
                urls={urls}
                featureLabel={featureLabel(u.feature_id)}
                onShare={(on) => share.mutate({ id: u.id, on })}
                onDelete={() => del.mutate(u.id)}
              />
            ))}
        </ul>
      )}

      <BeforeAfter project={project} features={features} />

      <PostUpdateSheet open={posting} onOpenChange={setPosting} projectId={project.id} features={features} mode="owner" onShared={afterShare} />
      <LetClientKnowDialog open={letKnow} onOpenChange={setLetKnow} project={project} />
      <MilestonesDialog open={editingMilestones} onOpenChange={setEditingMilestones} projectId={project.id} features={features} presets={settings?.milestones} />
    </section>
  );
}

function Photos({ update, urls }: { update: ProgressUpdate; urls: Record<string, string> }) {
  const photos = update.photos ?? [];
  if (!photos.length) return null;
  return (
    <div className="mt-2 grid grid-cols-4 gap-1">
      {photos.map((p) => (
        <a key={p.id} href={urls[p.storage_path]} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md bg-muted">
          {urls[p.storage_path] && <img src={urls[p.storage_path]} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </a>
      ))}
    </div>
  );
}

function Meta({ update, featureLabel }: { update: ProgressUpdate; featureLabel: string | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      {new Date(update.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      {update.author_name ? ` · ${update.author_name}` : ""}
      {featureLabel ? ` · ${featureLabel}` : ""}
      {update.milestone && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{update.milestone}</span>}
    </p>
  );
}

function ReviewRow({ update: u, urls, featureLabel, onApprove, onInternal }: { update: ProgressUpdate; urls: Record<string, string>; featureLabel: string | null; onApprove: () => void; onInternal: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(u.note ?? "");
  const save = useMutation({
    mutationFn: () => updateProgressNote(u.id, note.trim() || null),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["progress-updates"] });
    },
  });
  return (
    <div className="rounded-lg bg-background p-2.5">
      <Meta update={u} featureLabel={featureLabel} />
      {editing ? (
        <div className="mt-1 space-y-1.5">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Save note
          </Button>
        </div>
      ) : (
        u.note && <p className="mt-1 text-sm text-foreground">{u.note}</p>
      )}
      <Photos update={u} urls={urls} />
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Button size="sm" className="h-10 font-bold" onClick={onApprove}>
          <Check className="mr-1 h-4 w-4" /> Share
        </Button>
        <Button size="sm" variant="outline" className="h-10" onClick={() => setEditing((e) => !e)}>
          Edit note
        </Button>
        <Button size="sm" variant="ghost" className="h-10 text-muted-foreground" onClick={onInternal}>
          Keep internal
        </Button>
      </div>
    </div>
  );
}

function FeedRow({
  update: u,
  urls,
  featureLabel,
  onShare,
  onDelete,
}: {
  update: ProgressUpdate;
  urls: Record<string, string>;
  featureLabel: string | null;
  onShare: (on: boolean) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const send = useMutation({
    mutationFn: () => replyToProgressComment(u, reply),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["progress-updates"] });
    },
  });
  const s = STATUS[u.status];
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <Meta update={u} featureLabel={featureLabel} />
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", s.tone)}>{s.label}</span>
      </div>
      {u.note && <p className="mt-1 text-sm text-foreground">{u.note}</p>}
      <Photos update={u} urls={urls} />
      {(u.liked || (u.comments ?? []).length > 0) && (
        <div className="mt-2 space-y-1 border-t border-hairline pt-2">
          {u.liked && (
            <p className="flex items-center gap-1 text-xs font-semibold text-success">
              <ThumbsUp className="h-3.5 w-3.5" /> The client liked this
            </p>
          )}
          {(u.comments ?? []).map((c) => (
            <p key={c.id} className={cn("rounded-lg px-2.5 py-1.5 text-sm", c.author === "client" ? "bg-info/10" : "ml-6 bg-muted")}>
              <span className="font-semibold">{c.author === "client" ? c.author_name ?? "Client" : "You"}: </span>
              {c.body}
            </p>
          ))}
          {(u.comments ?? []).some((c) => c.author === "client") && (
            <div className="flex gap-1.5">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={1} placeholder="Reply…" className="min-h-[40px]" />
              <Button size="sm" className="h-10" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        {u.status === "shared" ? (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onShare(false)}>
            <EyeOff className="mr-1 h-3.5 w-3.5" /> Unshare
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onShare(true)}>
            <Share2 className="mr-1 h-3.5 w-3.5" /> Share with client
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </li>
  );
}

function BeforeAfter({ project, features }: { project: Project; features: PostFeature[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: images = [] } = useQuery({ queryKey: ["project-images", project.id], queryFn: () => listProjectImages(project.id), enabled: open });
  const { data: urls = {} } = useQuery({
    queryKey: ["ba-urls", images.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(images.map((i) => i.storage_path)),
    enabled: open && images.length > 0,
  });
  const [featureId, setFeatureId] = useState<string | null>(features[0]?.id ?? null);
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "before" | "after" | null }) => setPhotoBeforeAfter(id, role, featureId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-images", project.id] }),
  });
  const before = images.find((i) => i.ba_role === "before" && i.ba_feature_id === featureId);
  const after = images.find((i) => i.ba_role === "after" && i.ba_feature_id === featureId);
  const save = useMutation({
    mutationFn: () =>
      addPortfolioItem({ project_id: project.id, feature_id: featureId, before_image_id: before!.id, after_image_id: after!.id, title: `${project.name}${features.find((f) => f.id === featureId) ? ` · ${features.find((f) => f.id === featureId)!.label}` : ""}` }),
    onSuccess: () => toast({ title: "Saved to portfolio" }),
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border-t border-hairline pt-3">
      <button type="button" className="text-sm font-bold text-foreground" onClick={() => setOpen((o) => !o)}>
        Before & after {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {features.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {features.map((f) => (
                <Button key={f.id} size="sm" variant={f.id === featureId ? "default" : "outline"} className="h-8 text-xs" onClick={() => setFeatureId(f.id)}>
                  {f.label}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Tap Before / After under a photo. Marked photos show as a comparison in the client's Hub.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="space-y-1">
                <div className={cn("aspect-square overflow-hidden rounded-md bg-muted", img.ba_role && img.ba_feature_id === featureId && "ring-2 ring-primary")}>
                  {urls[img.storage_path] && <img src={urls[img.storage_path]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="flex gap-1">
                  {(["before", "after"] as const).map((r) => {
                    const on = img.ba_role === r && img.ba_feature_id === featureId;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole.mutate({ id: img.id, role: on ? null : r })}
                        className={cn("flex-1 rounded px-1 py-0.5 text-[10px] font-bold capitalize", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={!before || !after || save.isPending} onClick={() => save.mutate()}>
            Save pair to portfolio
          </Button>
        </div>
      )}
    </div>
  );
}

function LetClientKnowDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project }) {
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile, enabled: open });
  const client = (project as Project & { client?: { name: string; phone?: string | null; email?: string | null } | null }).client;
  const filled = fillTemplate(PROGRESS_MESSAGE, {
    client_first_name: firstName(client?.name),
    company_name: profile?.company_name?.trim() || "your contractor",
    project_name: project.name,
    client_hub_link: clientHubLink(project.id),
  });
  const [message, setMessage] = useState(filled);
  const [edited, setEdited] = useState(false);
  const shown = edited ? message : filled;
  const done = async (channel?: "text" | "email" | "copy") => {
    await markProgressPrompted(project.id);
    if (channel && project.client_id) {
      await logActivity(project.client_id, channel === "copy" ? "note" : channel, `Progress update heads-up (${channel}): ${shown}`, { project_id: project.id });
    }
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : void done())}>
      <DialogContent className="max-w-md space-y-3">
        <DialogHeader>
          <DialogTitle>Let {firstName(client?.name)} know?</DialogTitle>
        </DialogHeader>
        <ClientMessageComposer
          message={shown}
          onMessageChange={(v) => (setEdited(true), setMessage(v))}
          subject={`Progress on your ${project.name}`}
          phone={client?.phone}
          email={client?.email}
          clientId={project.client_id}
          clientName={client?.name}
          onMarkSent={(ch) => void done(ch)}
          marking={false}
          onSkip={() => void done()}
        />
      </DialogContent>
    </Dialog>
  );
}

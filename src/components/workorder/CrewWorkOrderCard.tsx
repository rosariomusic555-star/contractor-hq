import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ClipboardList, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getCrewWorkOrder, getSignedImageUrls, saveCrewWorkOrderSettings, uploadCrewNotePhoto, type Project } from "@/lib/api";
import { crewSafeWorkOrder } from "@/lib/crewSafe";

/**
 * Project page (0125): the crew work order — Preview (exactly what the crew
 * sees), crew notes / special instructions (+ photos), client notes for the
 * crew, hide the client's phone, and who reviewed it.
 */
export function CrewWorkOrderCard({ project }: { project: Project }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState(project.crew_notes ?? "");
  const [clientNotes, setClientNotes] = useState(project.crew_client_notes ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setNotes(project.crew_notes ?? "");
    setClientNotes(project.crew_client_notes ?? "");
  }, [project.crew_notes, project.crew_client_notes]);
  const photos = project.crew_note_photos ?? [];

  const { data: wo } = useQuery({ queryKey: ["work-order", project.id], queryFn: async () => crewSafeWorkOrder(await getCrewWorkOrder(project.id)) });
  const { data: urls = {} } = useQuery({
    queryKey: ["crew-note-photos", photos.join(",")],
    queryFn: () => getSignedImageUrls(photos),
    enabled: photos.length > 0,
  });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof saveCrewWorkOrderSettings>[1]) => saveCrewWorkOrderSettings(project.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", project.id] });
      qc.invalidateQueries({ queryKey: ["work-order", project.id] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadCrewNotePhoto(project.id, f));
      await saveCrewWorkOrderSettings(project.id, { crew_note_photos: [...photos, ...paths] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", project.id] }),
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const review = wo?.reviews[0];
  const dirty = notes !== (project.crew_notes ?? "") || clientNotes !== (project.crew_client_notes ?? "");

  return (
    <section className="card-surface space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Crew work order
        </h3>
        <Button asChild size="sm" variant="outline">
          <Link to={`/projects/${project.id}/work-order`}>
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
          </Link>
        </Button>
      </div>
      {review ? (
        <p className={review.version === wo?.version ? "flex items-center gap-1.5 text-xs font-semibold text-success" : "text-xs font-semibold text-warning"}>
          {review.version === wo?.version ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {review.version === wo?.version
            ? `Reviewed by ${review.name} · ${new Date(review.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : `Scope changed since ${review.name} reviewed it — waiting for another review`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Generated from the job — no prices ever. Not reviewed by a crew lead yet.</p>
      )}
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Crew notes / special instructions</span>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Protect the irrigation heads along the fence" className="mt-1" />
      </label>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <span key={p} className="relative h-16 w-16 overflow-hidden rounded-lg bg-muted">
            {urls[p] && <img src={urls[p]} alt="" className="h-full w-full object-cover" />}
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => save.mutate({ crew_note_photos: photos.filter((x) => x !== p) })}
              className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) upload.mutate(files);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" className="h-16 w-16 flex-col gap-0.5 p-0 text-[10px]" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
          <Camera className="h-4 w-4" />
          {upload.isPending ? "…" : "Photo"}
        </Button>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Client notes for the crew</span>
        <Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2} placeholder="e.g. Dog in backyard, keep the gate closed" className="mt-1" />
      </label>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ crew_notes: notes.trim() || null, crew_client_notes: clientNotes.trim() || null })}>
            Save notes
          </Button>
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm text-foreground">Hide the client's phone number from the crew</span>
        <Switch checked={!!project.crew_hide_client_phone} onCheckedChange={(v) => save.mutate({ crew_hide_client_phone: v })} />
      </label>
    </section>
  );
}

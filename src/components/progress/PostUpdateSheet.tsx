import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addProgressPhoto,
  createProgressUpdate,
  crewFinishUpdate,
  crewPostUpdate,
  getProgressSettings,
  setProgressUpdateShared,
} from "@/lib/api";
import { milestonesFor } from "@/lib/progress";
import { enqueueUploads } from "@/lib/uploadQueue";

const NONE = "__none";

export interface PostFeature {
  id: string;
  label: string;
  category: string | null;
}

/**
 * Post a progress update (0126) — camera first, a short note, optional
 * feature + milestone, and "Share with client". The post saves right away;
 * photos upload in the background and retry on bad signal. Owner posts
 * default to shared; crew posts default to internal and, when shared, wait
 * for the contractor's approval (Settings › Progress updates).
 */
export function PostUpdateSheet({
  open,
  onOpenChange,
  projectId,
  features,
  mode,
  employeeId,
  onShared,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  features: PostFeature[];
  mode: "owner" | "crew";
  employeeId?: string | null;
  /** Owner: called once a shared update's photos are all up. */
  onShared?: () => void;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<string | null>(null);
  const [share, setShare] = useState(mode === "owner");
  const [saving, setSaving] = useState(false);
  const { data: settings } = useQuery({ queryKey: ["progress-settings"], queryFn: getProgressSettings, enabled: open && mode === "owner" });

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setNote("");
    setFeatureId(features.length === 1 ? features[0].id : null);
    setMilestone(null);
    setShare(mode === "owner");
  }, [open, mode, features]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const feature = features.find((f) => f.id === featureId) ?? null;
  const milestones = feature ? milestonesFor(feature.category, settings?.milestones) : [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["progress-updates"] });
    qc.invalidateQueries({ queryKey: ["project-images"] });
  };

  const post = async () => {
    setSaving(true);
    try {
      const snapshot = [...files];
      let updateId: string;
      if (mode === "crew") {
        updateId = await crewPostUpdate({ project_id: projectId, note: note.trim() || null, feature_id: featureId, milestone, share });
      } else {
        updateId = (await createProgressUpdate({ project_id: projectId, note: note.trim() || null, feature_id: featureId, milestone })).id;
      }
      const finish = async () => {
        if (mode === "crew") await crewFinishUpdate(updateId);
        else if (share) {
          await setProgressUpdateShared(updateId, true);
          onShared?.();
        }
        refresh();
      };
      if (snapshot.length) {
        enqueueUploads(
          updateId,
          snapshot.map((f, i) => ({ label: `Photo ${i + 1}`, run: () => addProgressPhoto(projectId, updateId, f, employeeId) })),
          () => void finish().catch(() => undefined),
        );
      } else {
        await finish();
      }
      refresh();
      toast({
        title: mode === "crew" && share ? "Posted — sent to the office for approval" : share ? "Posted and shared" : "Posted",
        description: snapshot.length ? `${snapshot.length} photo${snapshot.length === 1 ? "" : "s"} uploading in the background` : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't post", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (list: FileList | null) => setFiles((f) => [...f, ...[...(list ?? [])].filter((x) => x.type.startsWith("image/"))]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[94vh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle>Post update</SheetTitle>
          <SheetDescription>Photos upload in the background — you can close this right away.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-5 py-4">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-14 text-base font-bold" onClick={() => cameraRef.current?.click()}>
              <Camera className="mr-2 h-5 w-5" /> Camera
            </Button>
            <Button variant="outline" className="h-14 text-base font-bold" onClick={() => libraryRef.current?.click()}>
              <ImagePlus className="mr-2 h-5 w-5" /> Photos
            </Button>
          </div>
          {files.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {previews.map((u, i) => (
                <span key={u} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button type="button" aria-label="Remove" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What got done today?" className="text-base" />
          {features.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Select value={featureId ?? NONE} onValueChange={(v) => (setFeatureId(v === NONE ? null : v), setMilestone(null))}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Feature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No feature</SelectItem>
                  {features.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={milestone ?? NONE} onValueChange={(v) => setMilestone(v === NONE ? null : v)} disabled={!feature}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Milestone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No milestone</SelectItem>
                  {milestones.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-semibold text-foreground">Share with client</span>
              <span className="block text-xs text-muted-foreground">
                {mode === "crew" ? "The office approves it before the client sees it" : "Shows in their Client Hub progress feed"}
              </span>
            </span>
            <Switch checked={share} onCheckedChange={setShare} />
          </label>
        </div>
        <div className="sticky bottom-0 border-t border-hairline bg-background px-5 py-3">
          <Button className="h-12 w-full text-base font-bold" disabled={saving || (files.length === 0 && !note.trim())} onClick={() => void post()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

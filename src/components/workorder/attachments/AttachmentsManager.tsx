import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, FileText, FolderOpen, History, Loader2, MoreVertical, Paperclip, Pencil, Pin, PinOff, RefreshCw, Replace, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSignedImageUrls } from "@/lib/api";
import type { CrewAttachment, CrewWorkOrder } from "@/lib/crewSafe";
import { retryFailedUploads, subscribeUploads, uploadSnapshot } from "@/lib/uploadQueue";
import { ATTACHMENT_ACCEPT, ATTACHMENT_CATEGORIES, PRICE_REMINDER, attachmentFileError, categoryLabel, isPdf } from "@/lib/workOrderAttachments";
import {
  createWorkOrderAttachment,
  deleteWorkOrderAttachment,
  listAttachableFiles,
  listAttachmentVersions,
  prepareAttachmentFile,
  queueAttachmentUploads,
  reorderWorkOrderAttachments,
  replaceWorkOrderAttachment,
  updateWorkOrderAttachment,
  uploadWorkOrderFile,
  workOrderFilePath,
  type ExistingFile,
} from "@/lib/workOrderAttachmentsApi";
import { cn } from "@/lib/utils";

const PROJECT = "__project__";

/** Pending / failed background uploads (all of this session's). */
function useUploadState() {
  const [s, setS] = useState(uploadSnapshot());
  useEffect(() => subscribeUploads(() => setS(uploadSnapshot())), []);
  return s;
}

/**
 * The contractor's Attachments section on the work order preview: add
 * files (camera first on a phone, several at once, uploads in the
 * background and retries), attach existing project photos / pre-construction
 * files, then title, note, category, placement, pin, reorder, replace
 * (with history) and remove.
 */
export function AttachmentsManager({
  projectId,
  wo,
  urls,
  onOpen,
}: {
  projectId: string;
  wo: CrewWorkOrder;
  urls: Record<string, string>;
  onOpen: (a: CrewAttachment) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["work-order", projectId] });
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const uploads = useUploadState();
  const [editing, setEditing] = useState<CrewAttachment | null>(null);
  const [removing, setRemoving] = useState<CrewAttachment | null>(null);
  const [history, setHistory] = useState<CrewAttachment | null>(null);
  const [picking, setPicking] = useState(false);
  const [replacing, setReplacing] = useState<CrewAttachment | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const list = [...(wo.attachments ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const featureLabel = (id: string | null) => (id ? (wo.features.find((f) => f.id === id)?.label ?? "Whole project") : "Whole project");

  const add = (picked: FileList | null) => {
    const all = Array.from(picked ?? []);
    const bad = all.map(attachmentFileError).filter(Boolean) as string[];
    bad.forEach((m) => toast({ title: "Can't add that file", description: m, variant: "destructive" }));
    const ok = all.filter((f) => !attachmentFileError(f));
    if (!ok.length) return;
    queueAttachmentUploads(projectId, ok, { as: "owner", onDone: refresh });
    toast({ title: `Uploading ${ok.length} file${ok.length === 1 ? "" : "s"}…`, description: "You can keep working — set titles and categories once they're in." });
  };

  const patch = useMutation({
    mutationFn: ({ id, p }: { id: string; p: Parameters<typeof updateWorkOrderAttachment>[1] }) => updateWorkOrderAttachment(id, p),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const move = useMutation({
    mutationFn: (ids: string[]) => reorderWorkOrderAttachments(ids),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "Couldn't reorder", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (a: CrewAttachment) => deleteWorkOrderAttachment(a),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn't remove", description: e.message, variant: "destructive" }),
  });
  const replace = useMutation({
    mutationFn: async ({ a, file }: { a: CrewAttachment; file: File }) => {
      const err = attachmentFileError(file);
      if (err) throw new Error(err);
      const prepared = await prepareAttachmentFile(file);
      const path = workOrderFilePath(projectId, prepared.ext);
      await uploadWorkOrderFile(path, prepared);
      return replaceWorkOrderAttachment(a.id, path, prepared);
    },
    onSuccess: (v) => {
      toast({ title: `Replaced — now version ${v}`, description: "The crew is asked to review the work order again." });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Couldn't replace", description: e.message, variant: "destructive" }),
  });

  const startReplace = (a: CrewAttachment) => {
    setReplacing(a);
    replaceInput.current?.click();
  };

  const swap = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((a) => a.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    move.mutate(ids);
  };

  return (
    <section className="card-surface space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-subtle">
          <Paperclip className="h-4 w-4" /> Attachments for the crew
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10 font-semibold md:hidden" onClick={() => camera.current?.click()}>
            <Camera className="mr-1.5 h-4 w-4" /> Camera
          </Button>
          <Button variant="outline" className="h-10 font-semibold" onClick={() => files.current?.click()}>
            <Paperclip className="mr-1.5 h-4 w-4" /> Add files
          </Button>
          <Button variant="outline" className="h-10 font-semibold" onClick={() => setPicking(true)}>
            <FolderOpen className="mr-1.5 h-4 w-4" /> From project
          </Button>
        </div>
      </div>
      <input ref={files} type="file" accept={ATTACHMENT_ACCEPT} multiple className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      <input
        ref={replaceInput}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f && replacing) replace.mutate({ a: replacing, file: f });
          setReplacing(null);
        }}
      />

      <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" /> {PRICE_REMINDER} Photos, PDFs · up to 25 MB each.
      </p>

      {(uploads.pending > 0 || uploads.failed > 0 || replace.isPending) && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {uploads.pending > 0 || replace.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {uploads.pending > 0 && `Uploading ${uploads.pending}…`}
          {replace.isPending && "Replacing…"}
          {uploads.failed > 0 && (
            <button type="button" onClick={retryFailedUploads} className="inline-flex items-center gap-1 font-semibold text-destructive hover:underline">
              <RefreshCw className="h-3.5 w-3.5" /> {uploads.failed} failed — retry
            </button>
          )}
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet. Add site plans, layout drawings, sketches, marked-up photos, spec sheets or HOA / permit plans.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {list.map((a, i) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <button type="button" onClick={() => onOpen(a)} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted" aria-label={`Open ${a.title}`}>
                {isPdf(a.mime_type) ? (
                  <span className="flex h-full w-full items-center justify-center text-destructive">
                    <FileText className="h-5 w-5" />
                  </span>
                ) : urls[a.id] ? (
                  <img src={urls[a.id]} alt="" className="h-full w-full object-cover" />
                ) : null}
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                  {a.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  {a.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {categoryLabel(a.category)} · {featureLabel(a.feature_id)}
                  {a.version > 1 ? ` · v${a.version}` : ""}
                  {a.added_by_crew ? ` · Added by crew${a.added_by_name ? ` (${a.added_by_name})` : ""}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconBtn label={a.pinned ? "Unpin" : "Pin to top"} onClick={() => patch.mutate({ id: a.id, p: { pinned: !a.pinned } })}>
                  {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </IconBtn>
                <div className="hidden items-center sm:flex">
                  <IconBtn label="Move up" disabled={i === 0 || move.isPending} onClick={() => swap(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Move down" disabled={i === list.length - 1 || move.isPending} onClick={() => swap(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Edit title, category, placement" onClick={() => setEditing(a)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Replace file" onClick={() => startReplace(a)}>
                    <Replace className="h-4 w-4" />
                  </IconBtn>
                  {a.version > 1 && (
                    <IconBtn label="Earlier versions" onClick={() => setHistory(a)}>
                      <History className="h-4 w-4" />
                    </IconBtn>
                  )}
                  <IconBtn label="Remove" onClick={() => setRemoving(a)} className="hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
                {/* Phone: the same actions in one menu, so the title keeps its room. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`More actions for ${a.title}`} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:hidden">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(a)}>Edit details</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onSelect={() => swap(i, -1)}>Move up</DropdownMenuItem>
                    <DropdownMenuItem disabled={i === list.length - 1} onSelect={() => swap(i, 1)}>Move down</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startReplace(a)}>Replace file</DropdownMenuItem>
                    {a.version > 1 && <DropdownMenuItem onSelect={() => setHistory(a)}>Earlier versions</DropdownMenuItem>}
                    <DropdownMenuItem className="text-destructive" onSelect={() => setRemoving(a)}>Remove</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EditDialog attachment={editing} features={wo.features} onClose={() => setEditing(null)} onSave={(p) => editing && patch.mutateAsync({ id: editing.id, p }).then(() => setEditing(null))} />
      <PickExistingDialog open={picking} projectId={projectId} already={new Set(list.map((a) => a.storage_path))} onClose={() => setPicking(false)} onDone={refresh} />
      <HistoryDialog attachment={history} onClose={() => setHistory(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removing?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the crew's work order. {removing && removing.storage_path.startsWith("work-order/") ? "The uploaded file and its earlier versions are deleted." : "The original project file stays where it is."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removing && remove.mutate(removing)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30", className)}
    >
      {children}
    </button>
  );
}

function EditDialog({
  attachment: a,
  features,
  onClose,
  onSave,
}: {
  attachment: CrewAttachment | null;
  features: CrewWorkOrder["features"];
  onClose: () => void;
  onSave: (p: { title: string; note: string | null; category: CrewAttachment["category"]; feature_id: string | null; pinned: boolean }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<CrewAttachment["category"]>("other");
  const [placement, setPlacement] = useState(PROJECT);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!a) return;
    setTitle(a.title);
    setNote(a.note ?? "");
    setCategory(a.category);
    setPlacement(a.feature_id ?? PROJECT);
    setPinned(a.pinned);
  }, [a]);
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attachment details</DialogTitle>
          <DialogDescription>What the crew sees, and where on the work order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="att-title">Title</Label>
            <Input id="att-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Patio layout with dimensions" maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="att-note">Note (optional)</Label>
            <Textarea id="att-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. North is up. Gas line along the fence." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CrewAttachment["category"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTACHMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Shows in</Label>
              <Select value={placement} onValueChange={setPlacement}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PROJECT}>Whole project (top)</SelectItem>
                  {features.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={pinned} onCheckedChange={(v) => setPinned(v === true)} className="mt-0.5" />
            <span>
              <span className="font-semibold text-foreground">Pin to the top</span>
              <span className="block text-muted-foreground">Key files (like the site plan) show first, large.</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ title: title.trim(), note: note.trim() || null, category, feature_id: placement === PROJECT ? null : placement, pinned });
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickExistingDialog({ open, projectId, already, onClose, onDone }: { open: boolean; projectId: string; already: Set<string>; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => setChosen(new Set()), [open]);
  const { data: files = [], isLoading } = useQuery({ queryKey: ["work-order-attachable", projectId], queryFn: () => listAttachableFiles(projectId), enabled: open });
  const available = files.filter((f) => !already.has(f.storage_path));
  const imagePaths = available.filter((f) => !isPdf(f.mime_type)).map((f) => f.storage_path);
  const { data: urls = {} } = useQuery({ queryKey: ["work-order-attachable-urls", imagePaths.join(",")], queryFn: () => getSignedImageUrls(imagePaths), enabled: open && imagePaths.length > 0 });
  const attach = useMutation({
    mutationFn: async () => {
      for (const f of available.filter((x) => chosen.has(x.storage_path))) {
        await createWorkOrderAttachment({ project_id: projectId, title: f.title, category: f.category, source: f.source, source_id: f.source_id, storage_path: f.storage_path, mime_type: f.mime_type });
      }
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't attach", description: e.message, variant: "destructive" }),
  });
  const group = (s: ExistingFile["source"]) => available.filter((f) => f.source === s);
  const row = (f: ExistingFile) => (
    <label key={f.storage_path} className="flex cursor-pointer items-center gap-3 rounded-lg p-1.5 hover:bg-muted/50">
      <Checkbox
        checked={chosen.has(f.storage_path)}
        onCheckedChange={(v) =>
          setChosen((s) => {
            const n = new Set(s);
            if (v === true) n.add(f.storage_path);
            else n.delete(f.storage_path);
            return n;
          })
        }
      />
      {isPdf(f.mime_type) ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <FileText className="h-4 w-4" />
        </span>
      ) : (
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">{urls[f.storage_path] && <img src={urls[f.storage_path]} alt="" className="h-full w-full object-cover" />}</span>
      )}
      <span className="min-w-0 truncate text-sm text-foreground">{f.title}</span>
    </label>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attach from this project</DialogTitle>
          <DialogDescription>No re-upload — the crew sees the same file.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-subtle" />
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing else to attach — no project photos or pre-construction files that aren't attached already.</p>
        ) : (
          <div className="space-y-3">
            {group("precon").length > 0 && (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-subtle">Pre-construction files</p>
                {group("precon").map(row)}
              </div>
            )}
            {group("project_photo").length > 0 && (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-subtle">Project photos</p>
                {group("project_photo").map(row)}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!chosen.size || attach.isPending} onClick={() => attach.mutate()}>
            Attach {chosen.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ attachment: a, onClose }: { attachment: CrewAttachment | null; onClose: () => void }) {
  const { data: versions = [], isLoading } = useQuery({ queryKey: ["work-order-attachment-versions", a?.id], queryFn: () => listAttachmentVersions(a!.id), enabled: !!a });
  const paths = versions.map((v) => v.storage_path);
  const { data: urls = {} } = useQuery({ queryKey: ["work-order-attachment-version-urls", paths.join(",")], queryFn: () => getSignedImageUrls(paths), enabled: paths.length > 0 });
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Earlier versions · {a?.title}</DialogTitle>
          <DialogDescription>The crew only sees the current version (v{a?.version}).</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-subtle" />
        ) : (
          <ul className="divide-y divide-hairline text-sm">
            {versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold text-foreground">v{v.version}</span>
                  <span className="text-muted-foreground"> · replaced {new Date(v.replaced_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </span>
                {urls[v.storage_path] && (
                  <a href={urls[v.storage_path]} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getSignedImageUrls, updatePreconItem, uploadPreconFile } from "@/lib/api";
import { AUTO_KINDS, PERMIT_STATUS_LABEL, locateDates, type ItemState, type ItemView, type PreconSettingsLike } from "@/lib/precon";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

const STATES: { v: ItemState; label: string }[] = [
  { v: "open", label: "Open" },
  { v: "done", label: "Done" },
  { v: "na", label: "N/A for this job" },
];

const dayLabel = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "min-h-[40px] rounded-lg border px-3 text-sm font-semibold transition-colors",
            value === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Edit one checklist item (0124) — a bottom sheet on phones. Auto items: the
 * app's result, with "Mark by hand" (+ note) to override. HOA / permit:
 * status, number, date, a document. 811: ticket #, date submitted → clear to
 * dig + expiry (working days), a photo of the ticket. Any item can be
 * removed from this job; manual ones can be N/A.
 */
function PreconItemSheetInner({
  view,
  projectId,
  settings,
  onOpenChange,
}: {
  view: ItemView | null;
  projectId: string;
  settings: PreconSettingsLike;
  onOpenChange: (o: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const item = view?.item;
  const [override, setOverride] = useState(false);
  const [status, setStatus] = useState<ItemState>("open");
  const [note, setNote] = useState("");
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setOverride(item.override);
    setStatus(item.status);
    setNote(item.note ?? "");
    setDetails(item.details ?? {});
  }, [item]);

  const filePath = typeof details.file === "string" ? details.file : null;
  const { data: fileUrl } = useQuery({
    queryKey: ["precon-file", filePath],
    queryFn: async () => (await getSignedImageUrls([filePath as string]))[filePath as string] ?? null,
    enabled: !!filePath,
  });

  const done = () => {
    qc.invalidateQueries({ queryKey: ["precon"] });
    onOpenChange(false);
  };
  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const save = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("No item");
      const auto = AUTO_KINDS.has(item.kind);
      const manualStatus =
        item.kind === "hoa" || item.kind === "permit"
          ? details.status === "not_needed"
            ? "na"
            : details.status === "approved"
              ? "done"
              : status === "na"
                ? "na"
                : "open"
          : status;
      return updatePreconItem(item.id, {
        override: auto ? override : false,
        status: auto ? (override ? status : "open") : manualStatus,
        note: note.trim() || null,
        details,
      });
    },
    onSuccess: done,
    onError,
  });
  const remove = useMutation({ mutationFn: () => updatePreconItem(item!.id, { removed: true }), onSuccess: done, onError });
  const upload = useMutation({
    mutationFn: (file: File) => uploadPreconFile(projectId, file),
    onSuccess: (path) => setDetails((d) => ({ ...d, file: path })),
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const set = (k: string, v: unknown) => setDetails((d) => ({ ...d, [k]: v }));
  const auto = item ? AUTO_KINDS.has(item.kind) : false;
  const locate = item?.kind === "locate" ? locateDates(details.submitted as string | undefined, settings) : null;

  return (
    <Sheet open={!!view} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[92vh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle>{item?.label}</SheetTitle>
          <SheetDescription>{view?.detail || (item?.required ? "Required before starting" : "Optional")}</SheetDescription>
        </SheetHeader>

        {item && (
          <div className="flex-1 space-y-4 px-5 py-4">
            {auto && (
              <>
                <p className="text-sm text-muted-foreground">
                  Checked automatically: <span className="font-semibold text-foreground">{view?.autoState ?? view?.state}</span>
                  {view?.autoState && " (overridden)"}.
                </p>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <span className="text-sm font-semibold text-foreground">Mark by hand</span>
                  <Switch checked={override} onCheckedChange={setOverride} />
                </label>
                {override && <Segmented<ItemState> value={status} onChange={setStatus} options={STATES} />}
              </>
            )}

            {(item.kind === "hoa" || item.kind === "permit") && (
              <>
                <Segmented
                  value={String(details.status ?? "") as "not_needed" | "submitted" | "approved"}
                  onChange={(v) => set("status", v)}
                  options={(["not_needed", "submitted", "approved"] as const).map((v) => ({ v, label: PERMIT_STATUS_LABEL[v] }))}
                />
                {item.kind === "permit" && (
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">Permit #</span>
                    <Input value={String(details.number ?? "")} onChange={(e) => set("number", e.target.value)} className="mt-1 h-11" />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">{details.status === "approved" ? "Approved on" : "Submitted on"}</span>
                  <Input type="date" value={String(details.date ?? "")} onChange={(e) => set("date", e.target.value)} className="mt-1 h-11" />
                </label>
              </>
            )}

            {item.kind === "locate" && (
              <>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">811 ticket #</span>
                  <Input
                    inputMode="text"
                    autoCapitalize="characters"
                    value={String(details.ticket ?? "")}
                    onChange={(e) => set("ticket", e.target.value)}
                    className="mt-1 h-12 text-lg font-bold tracking-wide"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">Date called / submitted</span>
                  <Input type="date" value={String(details.submitted ?? "")} onChange={(e) => set("submitted", e.target.value)} className="mt-1 h-11" />
                </label>
                {locate && (
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground">Clear to dig</p>
                      <p className="text-base font-bold text-foreground">{dayLabel(locate.clearToDig)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground">Expires</p>
                      <p className="text-base font-bold text-foreground">{dayLabel(locate.expires)}</p>
                    </div>
                    <p className="col-span-2 text-[11px] text-muted-subtle">
                      {settings.locate_wait_days} working days to wait, valid {settings.locate_valid_days} working days — set in Settings › Pre-construction
                      checklist to match your state's 811 rules.
                    </p>
                  </div>
                )}
                {view && view.warnings.length > 0 && (
                  <ul className="space-y-1">
                    {view.warnings.map((w) => (
                      <li key={w} className="text-sm font-semibold text-warning">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {(item.kind === "custom" || item.kind === "locate") && (
              <Segmented<ItemState> value={status === "done" && item.kind === "locate" ? "open" : status} onChange={setStatus} options={item.kind === "locate" ? [{ v: "open", label: "Needed" }, { v: "na", label: "N/A for this job" }] : STATES} />
            )}
            {(item.kind === "hoa" || item.kind === "permit") && (
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-foreground">N/A for this job</span>
                <Switch checked={status === "na"} onCheckedChange={(v) => setStatus(v ? "na" : "open")} />
              </label>
            )}

            {(item.kind === "hoa" || item.kind === "permit" || item.kind === "locate") && (
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" className="h-11 w-full" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {upload.isPending ? "Uploading…" : filePath ? "Replace photo / document" : "Add photo / document"}
                </Button>
                {filePath && fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <FileText className="h-4 w-4" /> View file
                  </a>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Note</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
            </label>

            <button type="button" className="text-sm font-semibold text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Remove from this job
            </button>
          </div>
        )}

        <div className="sticky bottom-0 flex gap-2 border-t border-hairline bg-background px-5 py-3">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-12 flex-1 font-bold" disabled={save.isPending || upload.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const PreconItemSheet = withErrorBoundary(PreconItemSheetInner, "PreconItemSheet");

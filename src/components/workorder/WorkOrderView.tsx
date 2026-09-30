import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  CloudRain,
  Download,
  MapPin,
  Paperclip,
  MessageSquareText,
  Navigation,
  Phone,
  Sparkles,
  Truck,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { crewLogUsage, crewWorkOrderOpened, getCrewWorkOrder, getSignedImageUrls, reviewCrewWorkOrder } from "@/lib/api";
import { crewSafeWorkOrder, type CrewMaterial, type CrewWorkOrder } from "@/lib/crewSafe";
import {
  CREW_MATERIAL_STATUS_LABEL,
  crewLocate,
  crewMaterialStatus,
  fmtQty,
  loadOfflineWorkOrder,
  navigateUrl,
  saveOfflineWorkOrder,
  telHref,
  workOrderChanges,
} from "@/lib/workOrder";
import { buildWorkOrderPdf, loadPinnedImagesForPdf, rasterizeDiagrams, saveWorkOrderPdf, workOrderFilename } from "@/lib/workOrderPdf";
import { isoDate } from "@/lib/weatherRisk";
import { PERMIT_STATUS_LABEL } from "@/lib/precon";
import { MeasurementDiagramView } from "@/components/measurements/MeasurementDiagramView";
import { ProjectForecastStrip } from "@/components/weather/ForecastStrip";
import { PostUpdateSheet } from "@/components/progress/PostUpdateSheet";
import type { CrewAttachment } from "@/lib/crewSafe";
import { ATTACHMENT_ACCEPT, attachmentFileError, groupAttachments, isPdf, newAttachmentIds, offlineAttachments } from "@/lib/workOrderAttachments";
import { queueAttachmentUploads, saveMarkupAttachment } from "@/lib/workOrderAttachmentsApi";
import { useAttachmentUrls, useOfflineAttachments } from "@/components/workorder/attachments/useAttachmentUrls";
import { AttachmentRows, PinnedAttachments } from "@/components/workorder/attachments/AttachmentTiles";
import { AttachmentViewer } from "@/components/workorder/attachments/AttachmentViewer";
import { AttachmentsManager } from "@/components/workorder/attachments/AttachmentsManager";
import { MarkupEditor } from "@/components/workorder/attachments/MarkupEditor";
import { Checkbox } from "@/components/ui/checkbox";

const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
const CONTEXT_LABEL: Record<string, string> = { slope: "Slope", access: "Access", soil: "Soil", demo: "Demo" };
const STATUS_TONE: Record<string, string> = {
  not_ordered: "bg-destructive/10 text-destructive",
  ordered: "bg-info/10 text-info",
  partial: "bg-warning-strong/15 text-warning",
  delivered: "bg-success/10 text-success",
  untracked: "bg-muted text-muted-foreground",
};

/** What gets stored as "last seen" — the scope, not who's looking. */
const snapshotOf = (wo: CrewWorkOrder) => {
  const { viewer: _v, last_open: _l, reviews: _r, ...rest } = wo;
  return rest;
};

/**
 * Crew work order (0125) — one phone-first page with everything needed on
 * site and no prices anywhere (it's built only from the crew-safe payload).
 * The owner sees exactly this as the "Preview". Last loaded copy is kept on
 * the device and opens read-only when signal drops.
 */

const CREW_ISSUE_LABEL: Record<"short" | "damaged" | "wrong_item" | "backordered", string> = {
  short: "Short on delivery",
  damaged: "Damaged on delivery",
  wrong_item: "Wrong item / color delivered",
  backordered: "Backordered",
};

export function WorkOrderView({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [offline, setOffline] = useState<string | null>(null);
  const diagramsRef = useRef<HTMLDivElement>(null);

  const { data: wo, isLoading, error } = useQuery({
    queryKey: ["work-order", projectId],
    queryFn: async () => {
      try {
        const w = crewSafeWorkOrder(await getCrewWorkOrder(projectId));
        if (w) {
          saveOfflineWorkOrder(projectId, w);
          setOffline(null);
        }
        return w;
      } catch (e) {
        const cached = loadOfflineWorkOrder(projectId);
        if (cached) {
          setOffline(cached.savedAt);
          return cached.wo;
        }
        throw e;
      }
    },
    retry: 1,
  });

  // "New since you last opened" — computed once per load, then recorded.
  const changes = useMemo(() => (wo && wo.last_open && wo.last_open.version !== wo.version ? workOrderChanges(wo.last_open.snapshot, wo) : []), [wo]);
  useEffect(() => {
    if (!wo || offline || wo.viewer?.is_owner) return;
    if (wo.last_open?.version === wo.version) return;
    void crewWorkOrderOpened(projectId, wo.version, snapshotOf(wo));
  }, [wo, offline, projectId]);

  const photoPaths = useMemo(
    () => [
      ...(wo?.photos ?? []).map((p) => p.storage_path),
      ...(wo?.crew_notes.photos ?? []),
      // 0152: delivery photos (where the pallets were dropped).
      ...(wo?.deliveries ?? []).flatMap((d) => (d.photos ?? []).map((p) => p.storage_path)),
    ],
    [wo],
  );
  const { data: urls = {} } = useQuery({
    queryKey: ["work-order-photos", projectId, photoPaths.join(",")],
    queryFn: () => getSignedImageUrls(photoPaths),
    enabled: photoPaths.length > 0 && !offline,
    staleTime: 30 * 60_000,
  });
  const [zoom, setZoom] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // 0154 — attachments: where they show, their URLs (device copy first),
  // what's new since this crew member last opened it, what's kept offline.
  const attachments = useMemo(() => wo?.attachments ?? [], [wo]);
  const groups = useMemo(() => groupAttachments(attachments, (wo?.features ?? []).map((f) => f.id)), [attachments, wo]);
  const attUrls = useAttachmentUrls(projectId, attachments, !!offline);
  const newIds = useMemo(
    () => (wo && !wo.viewer?.is_owner && wo.last_open && wo.last_open.version !== wo.version ? newAttachmentIds(wo.last_open.snapshot, wo) : new Set<string>()),
    [wo],
  );
  const keepOffline = useMemo(() => (wo ? offlineAttachments(wo, isoDate(new Date())) : []), [wo]);
  const offlineIds = useOfflineAttachments(projectId, keepOffline, attachments, !!offline);
  const [viewing, setViewing] = useState<number | null>(null);
  const openAttachment = (a: CrewAttachment) => setViewing(Math.max(0, groups.all.findIndex((x) => x.id === a.id)));
  const [markup, setMarkup] = useState<{ a: CrewAttachment; imageUrl: string; page?: number } | null>(null);
  const [includePdfs, setIncludePdfs] = useState(false);
  const crewFileInput = useRef<HTMLInputElement>(null);

  const review = useMutation({
    mutationFn: () => reviewCrewWorkOrder(projectId, wo!.version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-order", projectId] });
      toast({ title: "Marked reviewed" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const markupSave = useMutation({
    mutationFn: (out: { blob: Blob; width: number; height: number }) => saveMarkupAttachment(projectId, markup!.a, out, markup!.page),
    onSuccess: () => {
      toast({ title: "Marked-up copy saved", description: "It's next to the original — edit its title or pin it below." });
      setMarkup(null);
      setViewing(null);
      qc.invalidateQueries({ queryKey: ["work-order", projectId] });
    },
    onError: (err: Error) => toast({ title: "Couldn't save the markup", description: err.message, variant: "destructive" }),
  });
  const pdf = useMutation({
    mutationFn: async () => {
      const diagrams = diagramsRef.current ? await rasterizeDiagrams(diagramsRef.current) : new Map();
      const pinnedImages = await loadPinnedImagesForPdf(groups.pinned, attUrls);
      const doc = buildWorkOrderPdf(wo!, diagrams, new Date(), { pinnedImages, attachments: groups.all, featureLabel: (id) => wo!.features.find((f) => f.id === id)?.label ?? null });
      const pdfs = includePdfs ? groups.all.filter((a) => isPdf(a.mime_type) && attUrls[a.id]) : [];
      const skipped = await saveWorkOrderPdf(doc, workOrderFilename(wo!), pdfs.map((a) => ({ title: a.title, url: attUrls[a.id] })));
      if (skipped.length) toast({ title: "Some PDFs weren't added", description: `${skipped.join(", ")} couldn't be merged — open them from the work order.` });
    },
    onError: (err: Error) => toast({ title: "Couldn't make the PDF", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="p-4 text-muted-foreground">Loading work order…</p>;
  if (error || !wo) return <p className="p-4 text-destructive">Couldn't load this work order.</p>;

  const today = isoDate(new Date());
  const locate = crewLocate(wo, today);
  const latestReview = wo.reviews[0];
  const reviewedCurrent = latestReview?.version === wo.version;
  const canPdf = wo.viewer.is_owner || wo.viewer.is_lead;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24 text-base">
      {/* Sticky header: name + address + Navigate */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-b-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-foreground">{wo.project.name}</h1>
            {wo.project.address && (
              <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {wo.project.address}
              </p>
            )}
          </div>
          {wo.project.address && (
            <Button asChild className="h-11 shrink-0 font-bold">
              <a href={navigateUrl(wo.project.address)} target="_blank" rel="noreferrer">
                <Navigation className="mr-1.5 h-4 w-4" /> Navigate
              </a>
            </Button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-subtle">
          Last updated {wo.updated_at ? new Date(wo.updated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
        </p>
      </div>

      {offline && (
        <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm font-semibold text-foreground">
          <WifiOff className="h-4 w-4 shrink-0" /> Offline — showing the copy from{" "}
          {new Date(offline).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Read-only; files marked "Offline" still open.
        </p>
      )}

      {changes.length > 0 && (
        <section className="rounded-xl border border-info/40 bg-info/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-info">
            <Sparkles className="h-4 w-4" /> New since you last opened this
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {wo.viewer.is_owner && !offline && <AttachmentsManager projectId={projectId} wo={wo} urls={attUrls} onOpen={openAttachment} />}

      {/* Key files (pinned) — first thing on the page. */}
      <PinnedAttachments items={groups.pinned} urls={attUrls} newIds={newIds} offlineIds={offlineIds} onOpen={openAttachment} />
      {(groups.general.length > 0 || (wo.viewer.is_lead && !wo.viewer.is_owner && !offline)) && (
        <Section title="Attachments">
          <AttachmentRows items={groups.general} urls={attUrls} newIds={newIds} offlineIds={offlineIds} onOpen={openAttachment} />
          {wo.viewer.is_lead && !wo.viewer.is_owner && !offline && (
            <>
              <Button variant="outline" className="h-11 w-full font-semibold" onClick={() => crewFileInput.current?.click()}>
                <Paperclip className="mr-1.5 h-4 w-4" /> Add a file for the office
              </Button>
              <input
                ref={crewFileInput}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const all = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  all.map(attachmentFileError).filter(Boolean).forEach((m) => toast({ title: "Can't add that file", description: m!, variant: "destructive" }));
                  const ok = all.filter((f) => !attachmentFileError(f));
                  if (!ok.length) return;
                  queueAttachmentUploads(projectId, ok, { as: "crew", onDone: () => qc.invalidateQueries({ queryKey: ["work-order", projectId] }) });
                  toast({ title: `Uploading ${ok.length} file${ok.length === 1 ? "" : "s"}…`, description: "Shows as \"Added by crew\". Don't attach anything with prices." });
                }}
              />
            </>
          )}
        </Section>
      )}

      {/* Progress updates (0126) — crew posts from the job. */}
      {!offline && !wo.viewer.is_owner && (
        <Button className="h-12 w-full text-base font-bold" onClick={() => setPosting(true)}>
          <Camera className="mr-2 h-5 w-5" /> Post update
        </Button>
      )}
      <PostUpdateSheet
        open={posting}
        onOpenChange={setPosting}
        projectId={projectId}
        features={wo.features.map((f) => ({ id: f.id, label: f.label, category: f.category }))}
        mode="crew"
        employeeId={wo.viewer.employee_id}
      />

      {/* Header details */}
      <section className="card-surface space-y-2 p-4">
        <Row label="Client">{wo.client.name ?? "—"}</Row>
        <Row label="Dates">
          {day(wo.project.scheduled_start_date)}
          {wo.project.scheduled_end_date && wo.project.scheduled_end_date !== wo.project.scheduled_start_date ? ` – ${day(wo.project.scheduled_end_date)}` : ""}
        </Row>
        {wo.project.crew_name && <Row label="Crew">{wo.project.crew_name}</Row>}
        {wo.delays.map((d) => (
          <p key={`${d.date}-${d.days}`} className="flex items-center gap-1.5 text-sm font-semibold text-info">
            <CloudRain className="h-4 w-4" /> {d.reason === "rain" || d.reason === "weather_other" ? "Rain delay" : "Delay"} {day(d.date)} · +{d.days} day
            {d.days === 1 ? "" : "s"}
          </p>
        ))}
        {!offline && wo.project.scheduled_start_date && (
          <ProjectForecastStrip projectId={projectId} start={wo.project.scheduled_start_date} end={wo.project.scheduled_end_date} className="pt-1" />
        )}
      </section>

      {/* Reviewed / PDF */}
      {(wo.viewer.is_lead || wo.viewer.is_owner || latestReview) && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
          <p className="text-sm">
            {latestReview ? (
              reviewedCurrent ? (
                <span className="flex items-center gap-1.5 font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Reviewed by {latestReview.name} · {new Date(latestReview.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              ) : (
                <span className="font-semibold text-warning">Scope or files changed since {latestReview.name} reviewed it — needs another look</span>
              )
            ) : (
              <span className="text-muted-foreground">Not reviewed by a crew lead yet</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {wo.viewer.is_lead && !reviewedCurrent && !offline && (
              <Button className="h-11 font-bold" disabled={review.isPending} onClick={() => review.mutate()}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Reviewed
              </Button>
            )}
            {canPdf && attachments.some((a) => isPdf(a.mime_type)) && (
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Checkbox checked={includePdfs} onCheckedChange={(v) => setIncludePdfs(v === true)} /> Include attached PDFs
              </label>
            )}
            {canPdf && (
              <Button variant="outline" className="h-11" disabled={pdf.isPending} onClick={() => pdf.mutate()}>
                <Download className="mr-1.5 h-4 w-4" /> {pdf.isPending ? "Making PDF…" : "PDF"}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Site info */}
      <Section title="Site">
        {wo.site.conditions && <p className="whitespace-pre-wrap text-base text-foreground">{wo.site.conditions}</p>}
        <div className="flex flex-wrap gap-1.5">
          {(["slope", "access", "soil", "demo"] as const).map((k) =>
            wo.site[k] ? (
              <span key={k} className="rounded-full bg-muted px-2.5 py-1 text-sm font-semibold text-foreground">
                {CONTEXT_LABEL[k]}: {wo.site[k]}
              </span>
            ) : null,
          )}
        </div>
        {locate && (
          <div className={cn("rounded-xl border-2 p-3", locate.warning ? "border-destructive/60 bg-destructive/5" : "border-success/50 bg-success/5")}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">811 ticket</p>
            <p className="text-2xl font-extrabold tracking-wide text-foreground">{locate.ticket ? `#${locate.ticket}` : "None on file"}</p>
            {locate.clearToDig && (
              <p className="text-sm text-foreground">
                Clear to dig <b>{day(locate.clearToDig)}</b> · Expires <b>{day(locate.expires)}</b>
              </p>
            )}
            {locate.warning && (
              <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-destructive">
                <AlertTriangle className="h-5 w-5" /> {locate.warning}
              </p>
            )}
          </div>
        )}
        {wo.permits
          .filter((p) => p.kind !== "locate")
          .map((p) => (
            <Row key={p.kind} label={p.label}>
              {PERMIT_STATUS_LABEL[p.permit_status ?? ""] ?? "Not started"}
              {p.number ? ` · #${p.number}` : ""}
            </Row>
          ))}
      </Section>

      {/* Client contact */}
      <Section title="Client">
        <p className="text-lg font-bold text-foreground">{wo.client.name ?? "—"}</p>
        {wo.client.phone && (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="h-12 text-base font-bold">
              <a href={telHref(wo.client.phone)}>
                <Phone className="mr-2 h-5 w-5" /> Call
              </a>
            </Button>
            <Button asChild variant="outline" className="h-12 text-base font-bold">
              <a href={`sms:${wo.client.phone.replace(/[^\d+]/g, "")}`}>
                <MessageSquareText className="mr-2 h-5 w-5" /> Text
              </a>
            </Button>
          </div>
        )}
        {wo.client.notes_for_crew && (
          <p className="rounded-lg bg-warning-strong/10 p-3 text-base font-semibold text-foreground">{wo.client.notes_for_crew}</p>
        )}
      </Section>

      {(wo.crew_notes.text || wo.crew_notes.photos.length > 0) && (
        <Section title="Crew notes">
          {wo.crew_notes.text && <p className="whitespace-pre-wrap text-base text-foreground">{wo.crew_notes.text}</p>}
          <PhotoGrid paths={wo.crew_notes.photos} urls={urls} onOpen={setZoom} />
        </Section>
      )}

      {/* Scope by feature */}
      {wo.features.map((f) => (
        <FeatureBlock
          key={f.id}
          feature={f}
          changedLabels={changes.filter((c) => c.startsWith(f.label))}
          attachments={
            groups.byFeature.get(f.id)?.length ? (
              <AttachmentRows items={groups.byFeature.get(f.id)!} urls={attUrls} newIds={newIds} offlineIds={offlineIds} onOpen={openAttachment} />
            ) : null
          }
        />
      ))}
      {wo.general_scope.length > 0 && (
        <Section title="Other scope">
          <ScopeList items={wo.general_scope} />
        </Section>
      )}

      {/* Materials */}
      {wo.materials.length > 0 && (
        <Section title="Materials">
          <MaterialsList wo={wo} canLog={wo.viewer.can_log_usage && !offline} />
          {/* 0152 sends every delivery; before it only pending ones (no status "delivered"). */}
          {wo.deliveries.some((d) => d.status !== "delivered" && d.expected_date) && (
            <div className="space-y-1 border-t border-hairline pt-3">
              <p className="text-sm font-bold text-foreground">Upcoming deliveries</p>
              {wo.deliveries
                .filter((d) => d.status !== "delivered" && d.expected_date)
                .map((d) => (
                  <p key={d.id} className="flex items-center gap-1.5 text-sm text-foreground">
                    <Truck className="h-4 w-4 text-muted-foreground" /> {d.supplier ?? "Delivery"} · {day(d.expected_date)}
                    {d.open_issues ? <span className="text-xs font-semibold text-destructive">· {d.open_issues} issue{d.open_issues === 1 ? "" : "s"}</span> : null}
                  </p>
                ))}
            </div>
          )}
          {wo.deliveries.some((d) => (d.photos ?? []).length > 0) && (
            <div className="space-y-2 border-t border-hairline pt-3">
              <p className="text-sm font-bold text-foreground">Delivery photos</p>
              {wo.deliveries
                .filter((d) => (d.photos ?? []).length > 0)
                .map((d) => (
                  <div key={d.id}>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {d.supplier ?? "Delivery"}
                      {d.delivered_on ? ` · delivered ${day(d.delivered_on)}` : d.expected_date ? ` · ${day(d.expected_date)}` : ""}
                    </p>
                    <PhotoGrid paths={(d.photos ?? []).map((p) => p.storage_path)} urls={urls} onOpen={setZoom} />
                  </div>
                ))}
            </div>
          )}
        </Section>
      )}

      {wo.photos.length > 0 && (
        <Section title="Photos">
          <PhotoGrid paths={wo.photos.map((p) => p.storage_path)} urls={urls} onOpen={setZoom} />
        </Section>
      )}

      <AttachmentViewer
        items={groups.all}
        index={viewing}
        urls={attUrls}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
        onMarkup={wo.viewer.is_owner && !offline ? (a, src) => setMarkup({ a, imageUrl: src.imageUrl, page: src.page }) : undefined}
      />
      <MarkupEditor
        open={!!markup}
        imageUrl={markup?.imageUrl ?? null}
        title={markup ? `${markup.a.title}${markup.page ? ` p.${markup.page}` : ""}` : ""}
        onClose={() => setMarkup(null)}
        onSave={(out) => markupSave.mutateAsync(out)}
      />

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl p-2">{zoom && <img src={zoom} alt="" className="max-h-[85vh] w-full object-contain" />}</DialogContent>
      </Dialog>

      {/* Every diagram, always mounted off-screen — what the PDF rasterizes. */}
      <div ref={diagramsRef} aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 w-[480px]">
        {wo.features.flatMap((f) =>
          f.measurements.map((m) => (
            <div key={m.id} data-diagram-id={m.id}>
              <MeasurementDiagramView buildType={m.build_type} data={m.data} idPrefix={`pdf-${m.id}`} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-3 text-base">
      <span className="w-20 shrink-0 text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground">{children}</span>
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-subtle">{title}</h2>
      {children}
    </section>
  );
}

function ScopeList({ items }: { items: { name: string; description: string | null; quantity: number | null; unit: string | null }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => (
        <li key={i} className="text-base text-foreground">
          <span className="font-semibold">{s.name}</span>
          {s.quantity ? <span className="text-muted-foreground"> · {fmtQty(Number(s.quantity))} {s.unit ?? ""}</span> : null}
          {s.description && <span className="block whitespace-pre-wrap text-sm text-muted-foreground">{s.description}</span>}
        </li>
      ))}
    </ul>
  );
}

function FeatureBlock({ feature: f, changedLabels, attachments }: { feature: CrewWorkOrder["features"][number]; changedLabels: string[]; attachments?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="card-surface overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-[56px] w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-lg font-bold text-foreground">{f.label}</span>
          {(f.changes.length > 0 || changedLabels.length > 0) && (
            <span className="shrink-0 rounded-full bg-warning-strong/15 px-2 py-0.5 text-xs font-bold text-warning">Changed</span>
          )}
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-hairline p-4">
          {attachments}
          {f.measurements.map((m) => (
            <MeasurementDiagramView key={m.id} buildType={m.build_type} data={m.data} idPrefix={`wo-${m.id}`} />
          ))}
          {f.selections.length > 0 && (
            <div className="space-y-1">
              {f.selections.map((s) => (
                <p key={s.group} className="text-base">
                  <span className="text-sm font-semibold text-muted-foreground">{s.group}: </span>
                  <span className="font-bold text-foreground">{s.choices.join(" · ") || "—"}</span>
                </p>
              ))}
            </div>
          )}
          {f.scope.length > 0 && <ScopeList items={f.scope} />}
          {f.labor && (f.labor.crew_days || f.labor.man_hours) ? (
            <p className="text-sm font-semibold text-muted-foreground">
              Planned:{" "}
              {f.labor.crew_days
                ? `${fmtQty(Number(f.labor.crew_days))} crew-day${Number(f.labor.crew_days) === 1 ? "" : "s"}${f.labor.crew_size ? ` · crew of ${fmtQty(Number(f.labor.crew_size))}` : ""}`
                : `${fmtQty(Number(f.labor.man_hours))} man-hours`}
            </p>
          ) : null}
          {f.changes.map((c, i) => (
            <div key={i} className="rounded-lg border border-warning-strong/40 bg-warning-strong/10 p-3">
              <p className="text-sm font-bold text-warning">
                Changed · Change order #{c.number ?? ""} {c.title}
              </p>
              {c.scope_note && <p className="text-sm text-foreground">{c.scope_note}</p>}
              <ScopeList items={c.items} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MaterialsList({ wo, canLog }: { wo: CrewWorkOrder; canLog: boolean }) {
  const groups = new Map<string, CrewMaterial[]>();
  const label = (m: CrewMaterial) => wo.features.find((f) => f.id === m.feature_id)?.label ?? m.section ?? "General";
  // A 0-quantity line (a calculator slot that didn't apply) is nothing to bring.
  for (const m of wo.materials.filter((x) => Number(x.planned_quantity ?? x.quantity) > 0)) groups.set(label(m), [...(groups.get(label(m)) ?? []), m]);
  const [logging, setLogging] = useState<CrewMaterial | null>(null);
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([g, lines]) => (
        <div key={g}>
          <p className="mb-1 text-sm font-bold text-foreground">{g}</p>
          <ul className="divide-y divide-hairline">
            {lines.map((m) => {
              const s = crewMaterialStatus(m);
              return (
                <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-foreground">{m.name}</span>
                    {(m.color || m.product) && <span className="block text-sm text-muted-foreground">{[m.color, m.product].filter(Boolean).join(" · ")}</span>}
                    <span className="block text-sm text-foreground">
                      {fmtQty(s.planned)} {m.unit ?? ""}
                      {m.waste_percent ? <span className="text-muted-subtle"> (incl. {fmtQty(Number(m.waste_percent))}% waste)</span> : null}
                    </span>
                    {/* 0152: an open delivery issue on this material. */}
                    {m.orders
                      .filter((o) => o.issue)
                      .map((o, i) => (
                        <span key={i} className="block text-sm font-semibold text-destructive">
                          {CREW_ISSUE_LABEL[o.issue!]}
                          {o.issue_note ? ` — ${o.issue_note}` : ""}
                          {o.issue === "backordered" && o.issue_expected_date ? ` · expected ${day(o.issue_expected_date)}` : ""}
                        </span>
                      ))}
                    {/* What's already logged — so a second person doesn't log it again. */}
                    {Number(m.used) > 0 && (
                      <span className="block text-sm font-semibold text-info">
                        Used so far: {fmtQty(Number(m.used))} {m.unit ?? ""}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_TONE[s.status])}>{CREW_MATERIAL_STATUS_LABEL[s.status]}</span>
                    {canLog && m.tracked && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setLogging(m)}>
                        Log usage
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <LogUsageDialog line={logging} onClose={() => setLogging(null)} />
    </div>
  );
}

function LogUsageDialog({ line, onClose }: { line: CrewMaterial | null; onClose: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const log = useMutation({
    mutationFn: () => crewLogUsage(line!.id, Number(qty), note.trim() || null),
    onSuccess: () => {
      toast({ title: "Usage logged" });
      setQty("");
      setNote("");
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't log it", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm space-y-3">
        <p className="text-base font-bold text-foreground">Log usage · {line?.name}</p>
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">Quantity used ({line?.unit ?? "units"})</span>
          <Input inputMode="decimal" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 h-12 text-lg" />
        </label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-11" />
        <Button className="h-12 w-full text-base font-bold" disabled={!(Number(qty) > 0) || log.isPending} onClick={() => log.mutate()}>
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PhotoGrid({ paths, urls, onOpen }: { paths: string[]; urls: Record<string, string>; onOpen: (u: string) => void }) {
  if (paths.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {paths.map((p) =>
        urls[p] ? (
          <button key={p} type="button" onClick={() => onOpen(urls[p])} className="aspect-square overflow-hidden rounded-lg bg-muted">
            <img src={urls[p]} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div key={p} className="aspect-square rounded-lg bg-muted" />
        ),
      )}
    </div>
  );
}

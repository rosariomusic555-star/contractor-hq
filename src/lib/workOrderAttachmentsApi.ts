/* =============================================================================
 * Work order attachments (0154) — reads / writes. The contractor manages
 * them (RLS: owner only); crews get them read-only through the crew-facing
 * serializer (get_crew_work_order), and a crew lead can add one through
 * crew_add_work_order_attachment. Files: images bucket, work-order/{project}/….
 * ========================================================================== */

import { supabase } from "@/lib/supabase";
import type { CrewAttachment } from "@/lib/crewSafe";
import { defaultAttachmentTitle, guessCategory, isHeic, isPdf, type AttachmentCategory } from "@/lib/workOrderAttachments";
import { enqueueUploads } from "@/lib/uploadQueue";

const BUCKET = "images";
/** Plans need to stay legible when zoomed — much larger than regular photos. */
const MAX_IMAGE_EDGE = 3200;

export interface PreparedFile {
  blob: Blob;
  mime: string;
  ext: string;
  width: number | null;
  height: number | null;
  pageCount: number | null;
}

async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

async function toJpeg(bitmap: ImageBitmap, maxEdge = MAX_IMAGE_EDGE, quality = 0.88): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNG drawings → white paper, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process that image.");
  return { blob, width, height };
}

/** Loads pdf.js on first use (it's big) with its worker. */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

/**
 * Ready a file for upload: HEIC → JPEG (the browser's own decoder first,
 * heic2any where it can't — desktop Chrome), big photos capped at 3200 px,
 * PNG kept as-is when small (crisp line drawings), PDF page count read.
 */
export async function prepareAttachmentFile(file: File): Promise<PreparedFile> {
  if (isPdf(file.type) || /\.pdf$/i.test(file.name)) {
    let pageCount: number | null = null;
    try {
      const pdfjs = await loadPdfJs();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      pageCount = (await task.promise).numPages;
      void task.destroy();
    } catch {
      throw new Error(`"${file.name}" couldn't be opened as a PDF.`);
    }
    return { blob: file, mime: "application/pdf", ext: "pdf", width: null, height: null, pageCount };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    if (!isHeic(file)) throw new Error(`"${file.name}" couldn't be opened as an image.`);
    const heic2any = (await import("heic2any")).default;
    const converted = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.88 })) as Blob | Blob[];
    bitmap = await decodeImage(Array.isArray(converted) ? converted[0] : converted);
  }
  try {
    const small = Math.max(bitmap.width, bitmap.height) <= MAX_IMAGE_EDGE;
    if (small && file.type === "image/png" && file.size < 8 * 1024 * 1024) {
      return { blob: file, mime: "image/png", ext: "png", width: bitmap.width, height: bitmap.height, pageCount: null };
    }
    if (small && file.type === "image/jpeg" && file.size < 4 * 1024 * 1024) {
      return { blob: file, mime: "image/jpeg", ext: "jpg", width: bitmap.width, height: bitmap.height, pageCount: null };
    }
    const j = await toJpeg(bitmap);
    return { blob: j.blob, mime: "image/jpeg", ext: "jpg", width: j.width, height: j.height, pageCount: null };
  } finally {
    bitmap.close();
  }
}

export const workOrderFilePath = (projectId: string, ext: string) => `work-order/${projectId}/${crypto.randomUUID()}.${ext}`;

/** Upsert: a retried upload of the same prepared file lands on the same path. */
export async function uploadWorkOrderFile(path: string, file: PreparedFile): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file.blob, { contentType: file.mime, upsert: true });
  if (error) throw error;
}

export interface NewAttachment {
  project_id: string;
  title: string;
  category: AttachmentCategory;
  feature_id?: string | null;
  note?: string | null;
  pinned?: boolean;
  source: "upload" | "project_photo" | "precon" | "markup";
  source_id?: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
  marked_up_from?: string | null;
}

async function nextSortOrder(projectId: string): Promise<number> {
  const { data } = await supabase.from("work_order_attachments").select("sort_order").eq("project_id", projectId).order("sort_order", { ascending: false }).limit(1);
  return data?.[0] ? Number(data[0].sort_order) + 1 : 0;
}

export async function createWorkOrderAttachment(row: NewAttachment): Promise<string> {
  const { data, error } = await supabase
    .from("work_order_attachments")
    .insert({ ...row, sort_order: await nextSortOrder(row.project_id) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateWorkOrderAttachment(
  id: string,
  patch: Partial<Pick<CrewAttachment, "title" | "note" | "category" | "pinned" | "feature_id" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("work_order_attachments").update(patch).eq("id", id);
  if (error) throw error;
}

/** Save a new order (ids top to bottom). */
export async function reorderWorkOrderAttachments(ids: string[]): Promise<void> {
  const results = await Promise.all(ids.map((id, i) => supabase.from("work_order_attachments").update({ sort_order: i }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/** Remove the attachment; its own uploaded files (current + history) go too.
 * A linked project photo / pre-construction file is left untouched. */
export async function deleteWorkOrderAttachment(a: Pick<CrewAttachment, "id" | "storage_path">): Promise<void> {
  const { data: versions } = await supabase.from("work_order_attachment_versions").select("storage_path").eq("attachment_id", a.id);
  const { error } = await supabase.from("work_order_attachments").delete().eq("id", a.id);
  if (error) throw error;
  const paths = [a.storage_path, ...(versions ?? []).map((v) => v.storage_path as string)].filter((p) => p.startsWith("work-order/"));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export async function replaceWorkOrderAttachment(id: string, path: string, file: PreparedFile): Promise<number> {
  const { data, error } = await supabase.rpc("replace_work_order_attachment", {
    p_id: id,
    p_storage_path: path,
    p_mime_type: file.mime,
    p_size_bytes: file.blob.size,
    p_width: file.width,
    p_height: file.height,
    p_page_count: file.pageCount,
  });
  if (error) throw error;
  return Number(data);
}

export interface AttachmentVersion {
  version: number;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  title: string | null;
  replaced_at: string;
}

export async function listAttachmentVersions(id: string): Promise<AttachmentVersion[]> {
  const { data, error } = await supabase
    .from("work_order_attachment_versions")
    .select("version, storage_path, mime_type, size_bytes, title, replaced_at")
    .eq("attachment_id", id)
    .order("version", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as AttachmentVersion[];
}

/** Crew lead: add a file to the job's work order ("Added by crew"). */
export async function crewAddWorkOrderAttachment(projectId: string, path: string, file: PreparedFile, title: string, featureId: string | null): Promise<void> {
  const { error } = await supabase.rpc("crew_add_work_order_attachment", {
    p_project_id: projectId,
    p_storage_path: path,
    p_mime_type: file.mime,
    p_size_bytes: file.blob.size,
    p_title: title,
    p_feature_id: featureId,
    p_width: file.width,
    p_height: file.height,
    p_page_count: file.pageCount,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Existing files that can be attached without re-uploading
// ---------------------------------------------------------------------------

export interface ExistingFile {
  source: "project_photo" | "precon";
  source_id: string;
  storage_path: string;
  title: string;
  mime_type: string;
  category: AttachmentCategory;
}

const mimeFromPath = (p: string) =>
  /\.pdf$/i.test(p) ? "application/pdf" : /\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : /\.hei[cf]$/i.test(p) ? "image/heic" : "image/jpeg";

export async function listAttachableFiles(projectId: string): Promise<ExistingFile[]> {
  const [photos, precon] = await Promise.all([
    supabase.from("project_images").select("id, storage_path, caption, accepted").eq("project_id", projectId).order("sort_order").order("created_at"),
    supabase.from("project_precon_items").select("id, kind, label, details").eq("project_id", projectId).eq("removed", false),
  ]);
  const out: ExistingFile[] = [];
  for (const r of (precon.data ?? []) as { id: string; kind: string; label: string; details: Record<string, unknown> | null }[]) {
    const f = r.details?.file;
    if (typeof f === "string" && f) {
      out.push({
        source: "precon",
        source_id: r.id,
        storage_path: f,
        title: r.label || (r.kind === "hoa" ? "HOA approval" : r.kind === "locate" ? "811 ticket" : "Permit"),
        mime_type: mimeFromPath(f),
        category: r.kind === "hoa" || r.kind === "permit" ? "permit_hoa" : "other",
      });
    }
  }
  for (const r of (photos.data ?? []) as { id: string; storage_path: string; caption: string | null; accepted: boolean | null }[]) {
    if (r.accepted === false) continue; // a client photo still awaiting review
    out.push({ source: "project_photo", source_id: r.id, storage_path: r.storage_path, title: r.caption || "Project photo", mime_type: mimeFromPath(r.storage_path), category: "photo" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Background upload (camera-first on a job site: retries on slow signal)
// ---------------------------------------------------------------------------

/**
 * Queue files for upload with retry (src/lib/uploadQueue.ts). Each file is
 * prepared once and lands on one path (upsert), and its row is created
 * once — so a retry after a dropped connection never duplicates anything.
 * The contractor adds rows directly; a crew lead goes through the RPC.
 */
export function queueAttachmentUploads(
  projectId: string,
  files: File[],
  opts: { as: "owner" | "crew"; featureId?: string | null; onDone: () => void },
): void {
  const tasks = files.map((file) => {
    let prepared: PreparedFile | null = null;
    let path: string | null = null;
    let uploaded = false;
    let saved = false;
    return {
      label: file.name,
      run: async () => {
        prepared ??= await prepareAttachmentFile(file);
        path ??= workOrderFilePath(projectId, prepared.ext);
        if (!uploaded) {
          await uploadWorkOrderFile(path, prepared);
          uploaded = true;
        }
        if (saved) return;
        const title = defaultAttachmentTitle(file.name);
        if (opts.as === "crew") await crewAddWorkOrderAttachment(projectId, path, prepared, title, opts.featureId ?? null);
        else
          await createWorkOrderAttachment({
            project_id: projectId,
            title,
            category: guessCategory(file.name, prepared.mime),
            feature_id: opts.featureId ?? null,
            source: "upload",
            storage_path: path,
            mime_type: prepared.mime,
            size_bytes: prepared.blob.size,
            width: prepared.width,
            height: prepared.height,
            page_count: prepared.pageCount,
          });
        saved = true;
      },
    };
  });
  enqueueUploads(`work-order-${projectId}-${Date.now()}`, tasks, opts.onDone);
}

/** A marked-up copy: a new image attachment next to the original (which is
 * never changed), placed where the original shows. */
export async function saveMarkupAttachment(
  projectId: string,
  original: Pick<CrewAttachment, "id" | "title" | "category" | "feature_id">,
  out: { blob: Blob; width: number; height: number },
  page?: number,
): Promise<void> {
  const file: PreparedFile = { blob: out.blob, mime: "image/jpeg", ext: "jpg", width: out.width, height: out.height, pageCount: null };
  const path = workOrderFilePath(projectId, "jpg");
  await uploadWorkOrderFile(path, file);
  await createWorkOrderAttachment({
    project_id: projectId,
    title: `${original.title}${page ? ` p.${page}` : ""} (marked up)`.slice(0, 200),
    category: original.category,
    feature_id: original.feature_id,
    source: "markup",
    storage_path: path,
    mime_type: "image/jpeg",
    size_bytes: out.blob.size,
    width: out.width,
    height: out.height,
    marked_up_from: original.id,
  });
}

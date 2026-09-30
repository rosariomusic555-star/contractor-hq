/* =============================================================================
 * Work order attachments (0154) — pure helpers: categories, file checks,
 * where each attachment shows, what's new since the crew last opened the
 * work order, and which files to keep on the device for offline use.
 * ========================================================================== */

import type { CrewAttachment, CrewWorkOrder } from "@/lib/crewSafe";

export type AttachmentCategory = CrewAttachment["category"];

export const ATTACHMENT_CATEGORIES: { value: AttachmentCategory; label: string }[] = [
  { value: "site_plan", label: "Site plan" },
  { value: "layout", label: "Layout drawing" },
  { value: "photo", label: "Photo" },
  { value: "spec_sheet", label: "Spec sheet" },
  { value: "permit_hoa", label: "Permit & HOA" },
  { value: "other", label: "Other" },
];
export const categoryLabel = (c: string) => ATTACHMENT_CATEGORIES.find((x) => x.value === c)?.label ?? "Other";

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf";
export const PRICE_REMINDER = "Visible to your crew. Don't attach documents with prices.";

export const isPdf = (mime: string | null | undefined) => mime === "application/pdf";
export const isHeic = (f: { type: string; name: string }) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/** Null when the file is fine, else a message that names the file. */
export function attachmentFileError(f: { type: string; name: string; size: number }): string | null {
  const okType = isPdf(f.type) || /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || isHeic(f);
  if (!okType) return `"${f.name}" isn't a supported file — use a photo (JPG, PNG, HEIC) or a PDF.`;
  if (f.size > ATTACHMENT_MAX_BYTES) return `"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB per file.`;
  return null;
}

/** "patio_layout-v2.pdf" → "Patio layout v2". */
export function defaultAttachmentTitle(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base || /^(img|image|photo|dsc|pxl)?\s?\d+$/i.test(base)) return "Photo";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** A first guess from the name — the contractor can change it after upload. */
export function guessCategory(filename: string, mime: string): AttachmentCategory {
  const n = filename.toLowerCase();
  if (/site|plot|survey/.test(n)) return "site_plan";
  if (/permit|hoa|approval/.test(n)) return "permit_hoa";
  if (/spec|data ?sheet|install(ation)? guide|manual/.test(n)) return "spec_sheet";
  if (/layout|drawing|sketch|plan|design|elevation/.test(n)) return "layout";
  return isPdf(mime) ? "other" : "photo";
}

export const formatBytes = (n: number | null | undefined) =>
  !n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// ---------------------------------------------------------------------------
// Where each attachment shows
// ---------------------------------------------------------------------------

/**
 * Pinned → the top of the work order (even if it belongs to a feature — a
 * key file shows once, first). Unpinned → its feature's block, or the
 * project-wide list when it has no feature (or that feature is gone).
 */
export function groupAttachments(list: CrewAttachment[], featureIds: string[]) {
  const ordered = [...list].sort((a, b) => a.sort_order - b.sort_order);
  const known = new Set(featureIds);
  const pinned = ordered.filter((a) => a.pinned);
  const general = ordered.filter((a) => !a.pinned && (!a.feature_id || !known.has(a.feature_id)));
  const byFeature = new Map<string, CrewAttachment[]>();
  for (const a of ordered) {
    if (a.pinned || !a.feature_id || !known.has(a.feature_id)) continue;
    byFeature.set(a.feature_id, [...(byFeature.get(a.feature_id) ?? []), a]);
  }
  return { pinned, general, byFeature, all: [...pinned, ...general, ...featureIds.flatMap((id) => byFeature.get(id) ?? [])] };
}

// ---------------------------------------------------------------------------
// New since last opened
// ---------------------------------------------------------------------------

/** Added or replaced since the crew member's last open. */
export function newAttachmentIds(prev: Pick<CrewWorkOrder, "attachments"> | null | undefined, next: Pick<CrewWorkOrder, "attachments">): Set<string> {
  const out = new Set<string>();
  // An earlier copy saved before attachments existed can't say what's new.
  if (!prev?.attachments) return out;
  const before = new Map(prev.attachments.map((a) => [a.id, a.version]));
  for (const a of next.attachments ?? []) {
    const v = before.get(a.id);
    if (v === undefined || v !== a.version) out.add(a.id);
  }
  return out;
}

/** Lines for "New since you last opened this". */
export function attachmentChangeLines(prev: Pick<CrewWorkOrder, "attachments"> | null | undefined, next: Pick<CrewWorkOrder, "attachments">): string[] {
  if (!prev) return [];
  const before = new Map((prev.attachments ?? []).map((a) => [a.id, a]));
  const out: string[] = [];
  for (const a of next.attachments ?? []) {
    const p = before.get(a.id);
    if (!p) out.push(`New attachment: ${a.title}`);
    else if (p.version !== a.version) out.push(`Updated attachment: ${a.title}`);
  }
  for (const p of prev.attachments ?? []) if (!(next.attachments ?? []).some((a) => a.id === p.id)) out.push(`Removed attachment: ${p.title}`);
  return out;
}

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

/** Is this job on today's schedule (so every file should be on the device)? */
export function isJobToday(p: Pick<CrewWorkOrder["project"], "scheduled_start_date" | "scheduled_end_date" | "status">, today: string): boolean {
  const s = p.scheduled_start_date?.slice(0, 10);
  const e = (p.scheduled_end_date ?? p.scheduled_start_date)?.slice(0, 10);
  if (s && e && s <= today && today <= e) return true;
  return p.status === "in_progress";
}

/** Pinned files always; every file when the job is on today. */
export function offlineAttachments(wo: Pick<CrewWorkOrder, "attachments" | "project">, today: string): CrewAttachment[] {
  const all = wo.attachments ?? [];
  return isJobToday(wo.project, today) ? all : all.filter((a) => a.pinned);
}

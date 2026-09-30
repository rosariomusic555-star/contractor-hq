/* =============================================================================
 * Work order attachments on the device (0154) — the files themselves, kept
 * in the browser's Cache Storage next to the work order's offline copy, so a
 * site plan opens with poor or no signal. Keyed by attachment + version: a
 * replaced file is fetched again, the old copy pruned. Signed URLs expire;
 * cached copies don't need them. Everything is best-effort — no Cache
 * Storage (old browser, private mode) just means "online only".
 * ========================================================================== */

import type { CrewAttachment } from "@/lib/crewSafe";

const CACHE = "chq-work-order-files-v1";
const keyOf = (projectId: string, a: Pick<CrewAttachment, "id" | "version">) => `https://chq.local/work-order/${projectId}/${a.id}?v=${a.version}`;

const hasCaches = () => typeof window !== "undefined" && "caches" in window;

/** Which of these are already on the device. */
export async function cachedAttachmentIds(projectId: string, list: CrewAttachment[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hasCaches()) return out;
  try {
    const cache = await caches.open(CACHE);
    await Promise.all(list.map(async (a) => ((await cache.match(keyOf(projectId, a))) ? out.add(a.id) : null)));
  } catch {
    // unavailable — treat as nothing cached
  }
  return out;
}

/** A local object URL for a cached file, or null. */
export async function cachedAttachmentUrl(projectId: string, a: CrewAttachment): Promise<string | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(CACHE)).match(keyOf(projectId, a));
    return res ? URL.createObjectURL(await res.blob()) : null;
  } catch {
    return null;
  }
}

/**
 * Download what isn't on the device yet (signed URLs fetched on demand) and
 * drop copies of this project's attachments that are gone or replaced.
 */
export async function syncAttachmentCache(
  projectId: string,
  keep: CrewAttachment[],
  all: CrewAttachment[],
  signUrls: (paths: string[]) => Promise<Record<string, string>>,
): Promise<Set<string>> {
  if (!hasCaches()) return new Set();
  const cache = await caches.open(CACHE);
  const wanted = new Set(keep.map((a) => keyOf(projectId, a)));
  const current = new Set(all.map((a) => keyOf(projectId, a)));
  for (const req of await cache.keys()) {
    if (req.url.startsWith(`https://chq.local/work-order/${projectId}/`) && (!current.has(req.url) || !wanted.has(req.url))) await cache.delete(req);
  }
  const missing: CrewAttachment[] = [];
  for (const a of keep) if (!(await cache.match(keyOf(projectId, a)))) missing.push(a);
  if (missing.length) {
    const urls = await signUrls(missing.map((a) => a.storage_path));
    for (const a of missing) {
      const u = urls[a.storage_path];
      if (!u) continue;
      try {
        const res = await fetch(u);
        if (res.ok) await cache.put(keyOf(projectId, a), new Response(await res.blob(), { headers: { "Content-Type": a.mime_type } }));
      } catch {
        // poor signal — the next open tries again
      }
    }
  }
  return cachedAttachmentIds(projectId, keep);
}

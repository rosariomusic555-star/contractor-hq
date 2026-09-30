import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSignedImageUrls } from "@/lib/api";
import type { CrewAttachment } from "@/lib/crewSafe";
import { cachedAttachmentIds, cachedAttachmentUrl, syncAttachmentCache } from "@/lib/workOrderFileCache";

/** Each attachment's URL: the copy on the device when there is one, else a
 * signed (expiring) URL while online. */
export function useAttachmentUrls(projectId: string, list: CrewAttachment[], offline: boolean) {
  const key = list.map((a) => `${a.id}:${a.version}`).join(",");
  const { data = {} } = useQuery({
    queryKey: ["work-order-attachment-urls", projectId, key, offline],
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const out: Record<string, string> = {};
      const missing: CrewAttachment[] = [];
      for (const a of list) {
        const local = await cachedAttachmentUrl(projectId, a);
        if (local) out[a.id] = local;
        else missing.push(a);
      }
      if (missing.length && !offline) {
        const signed = await getSignedImageUrls(missing.map((a) => a.storage_path));
        for (const a of missing) if (signed[a.storage_path]) out[a.id] = signed[a.storage_path];
      }
      return out;
    },
  });
  return data;
}

/** Keep `keep` on the device (online), report which files are there. */
export function useOfflineAttachments(projectId: string, keep: CrewAttachment[], all: CrewAttachment[], offline: boolean) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const key = `${keep.map((a) => `${a.id}:${a.version}`).join(",")}|${all.length}`;
  useEffect(() => {
    let alive = true;
    const run = offline ? cachedAttachmentIds(projectId, all) : syncAttachmentCache(projectId, keep, all, getSignedImageUrls);
    run.then((s) => alive && setIds(s)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId, key, offline]); // eslint-disable-line react-hooks/exhaustive-deps
  return ids;
}

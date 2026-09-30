import { CloudOff, CheckCircle2, FileText, Pin, UserRound } from "lucide-react";
import type { CrewAttachment } from "@/lib/crewSafe";
import { categoryLabel, formatBytes, isPdf } from "@/lib/workOrderAttachments";
import { cn } from "@/lib/utils";
import { PdfThumb } from "./pdf";

interface TileProps {
  items: CrewAttachment[];
  urls: Record<string, string>;
  newIds: Set<string>;
  offlineIds: Set<string>;
  onOpen: (a: CrewAttachment) => void;
}

function Badges({ a, isNew, offline }: { a: CrewAttachment; isNew: boolean; offline: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {isNew && <span className="rounded-full bg-info px-2 py-0.5 text-[11px] font-bold text-info-foreground">{a.version > 1 ? "Updated" : "New"}</span>}
      {a.added_by_crew && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          <UserRound className="h-3 w-3" /> Added by crew{a.added_by_name ? ` · ${a.added_by_name}` : ""}
        </span>
      )}
      {offline && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-success" title="Saved on this device — opens without signal">
          <CheckCircle2 className="h-3 w-3" /> Offline
        </span>
      )}
    </span>
  );
}

function Thumb({ a, url, size }: { a: CrewAttachment; url?: string; size: "lg" | "sm" }) {
  const box = size === "lg" ? "aspect-[4/3] w-full" : "h-14 w-14 shrink-0";
  if (!url)
    return (
      <span className={cn("flex items-center justify-center rounded-lg bg-muted text-muted-subtle", box)}>
        {isPdf(a.mime_type) ? <FileText className="h-6 w-6" /> : <CloudOff className="h-5 w-5" />}
      </span>
    );
  if (isPdf(a.mime_type)) {
    return size === "lg" ? (
      <span className={cn("block overflow-hidden rounded-lg border border-border bg-white", box)}>
        <PdfThumb url={url} width={560} className="w-full [&_canvas]:!h-auto [&_canvas]:!w-full" />
      </span>
    ) : (
      <span className={cn("flex flex-col items-center justify-center rounded-lg bg-destructive/10 text-destructive", box)}>
        <FileText className="h-5 w-5" />
        <span className="text-[10px] font-bold">PDF</span>
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" className={cn("rounded-lg bg-muted object-cover", box)} />;
}

/** Pinned files at the top of the work order — big, one tap to open. */
export function PinnedAttachments({ items, urls, newIds, offlineIds, onOpen }: TileProps) {
  if (!items.length) return null;
  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-subtle">
        <Pin className="h-4 w-4" /> Key files
      </h2>
      <div className={cn("grid gap-3", items.length > 1 && "sm:grid-cols-2")}>
        {items.map((a) => (
          <button key={a.id} type="button" onClick={() => onOpen(a)} className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
            <Thumb a={a} url={urls[a.id]} size="lg" />
            <span className="mt-1.5 block text-base font-bold text-foreground group-hover:underline">
              {a.title} <span className="font-normal text-muted-foreground">· tap to open</span>
            </span>
            {a.note && <span className="block text-sm text-muted-foreground">{a.note}</span>}
            <Badges a={a} isNew={newIds.has(a.id)} offline={offlineIds.has(a.id)} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** A compact list — the project-wide files, or one feature's. */
export function AttachmentRows({ items, urls, newIds, offlineIds, onOpen }: TileProps) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-hairline">
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onOpen(a)} className="flex w-full items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <Thumb a={a} url={urls[a.id]} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-foreground">{a.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {categoryLabel(a.category)}
                {isPdf(a.mime_type) && a.page_count ? ` · ${a.page_count} page${a.page_count === 1 ? "" : "s"}` : ""}
                {a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}
                {a.note ? ` · ${a.note}` : ""}
              </span>
              <Badges a={a} isNew={newIds.has(a.id)} offline={offlineIds.has(a.id)} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

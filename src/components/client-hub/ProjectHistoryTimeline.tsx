import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, ChevronDown, FilePen, FilePlus2, FileText, GitBranch, Receipt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { buildProjectHistory, historyDate, type HistoryEntry, type HistoryKind, type HistoryTone } from "@/lib/projectHistory";

const KIND: Record<HistoryKind, { icon: LucideIcon; label: string; chip: string }> = {
  quote: { icon: FileText, label: "Quote", chip: "bg-info/15 text-info" },
  revision: { icon: FilePen, label: "Revised quote", chip: "bg-sky-500/15 text-sky-700" },
  addon: { icon: FilePlus2, label: "Add-on", chip: "bg-violet-500/15 text-violet-700" },
  change_order: { icon: GitBranch, label: "Change order", chip: "bg-orange-500/15 text-orange-700" },
  invoice: { icon: Receipt, label: "Invoice", chip: "bg-slate-500/15 text-slate-700" },
  payment: { icon: Banknote, label: "Payment", chip: "bg-success/15 text-success" },
};

const TONE: Record<HistoryTone, string> = {
  green: "bg-success/15 text-success",
  amber: "bg-warning/20 text-warning-strong",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-info/15 text-info",
  grey: "bg-muted text-muted-foreground",
};

const usd = (v: number) => (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The Client Hub's project history (0113): every client-facing financial
 * event, newest first (switchable). Each type has its own icon / color;
 * tapping an entry opens the document, version, or receipt; the chevron
 * expands its details. Pending / declined items are labeled and never
 * counted.
 */
export function ProjectHistoryTimeline({ detail, docBase }: { detail: PortalProjectDetail; docBase: string }) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const entries = useMemo(() => buildProjectHistory(detail, order), [detail, order]);
  if (entries.length === 0) return null;

  const hrefOf = (e: HistoryEntry) =>
    "receipt" in e.href
      ? { external: `/receipt/${e.href.receipt}` }
      : { to: `${docBase}/${e.href.doc.kind}/${e.href.doc.id}${e.href.doc.version ? `?v=${e.href.doc.version}` : ""}` };

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-foreground">Project history</h3>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold" role="group" aria-label="Sort order">
          {(["newest", "oldest"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrder(o)}
              aria-pressed={order === o}
              className={cn("rounded-md px-2.5 py-1", order === o ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {o === "newest" ? "Newest" : "Oldest"}
            </button>
          ))}
        </div>
      </div>

      <ol className="relative mt-4 space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
        {entries.map((e) => {
          const k = KIND[e.kind];
          const Icon = k.icon;
          const isOpen = open.has(e.key);
          const link = hrefOf(e);
          const body = (
            <>
              <div className={cn("text-sm font-bold text-foreground [overflow-wrap:anywhere]", e.struck && "text-muted-foreground line-through")}>
                {e.title}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {k.label} · {historyDate(e.date)}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[e.status.tone])}>{e.status.label}</span>
                  {e.note && <span className="text-[11px] text-muted-foreground">{e.note}</span>}
                </div>
                {e.amount != null && (
                  <div
                    className={cn(
                      "shrink-0 text-sm font-bold tabular-nums text-foreground",
                      (e.struck || !e.counted) && "text-muted-foreground",
                      e.struck && "line-through",
                    )}
                  >
                    {usd(e.amount)}
                  </div>
                )}
              </div>
            </>
          );
          return (
            <li key={e.key} className="relative flex gap-2.5 sm:gap-3">
              <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", k.chip)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-card">
                <div className="flex items-stretch">
                  {"to" in link ? (
                    <Link to={link.to} className="min-w-0 flex-1 p-3 hover:bg-muted/40">
                      {body}
                    </Link>
                  ) : (
                    <a href={link.external} target="_blank" rel="noreferrer" className="min-w-0 flex-1 p-3 hover:bg-muted/40">
                      {body}
                    </a>
                  )}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Hide details for ${e.title}` : `Show details for ${e.title}`}
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(e.key)) n.delete(e.key);
                        else n.add(e.key);
                        return n;
                      })
                    }
                    className="flex w-11 shrink-0 items-center justify-center border-l border-hairline text-muted-subtle hover:bg-muted/40"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                  </button>
                </div>
                {isOpen && (
                  <dl className="space-y-1 border-t border-hairline px-3 py-2.5 text-xs">
                    {e.details.map((d) => (
                      <div key={d.label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{d.label}</dt>
                        <dd className="text-right font-semibold text-foreground [overflow-wrap:anywhere]">{d.value}</dd>
                      </div>
                    ))}
                    <div className="pt-1">
                      {"to" in link ? (
                        <Link to={link.to} className="font-semibold text-primary hover:underline">
                          {e.kind === "payment" ? "View receipt" : "Open document"} →
                        </Link>
                      ) : (
                        <a href={link.external} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                          View receipt →
                        </a>
                      )}
                    </div>
                  </dl>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, Eye, EyeOff, ListChecks, Snowflake, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getNotificationSettings, listQuoteActivity, type Quote, type QuoteActivityEvent } from "@/lib/api";
import { activityByVersion, activityLine, coldLabel, coldState, durationText } from "@/lib/quoteActivity";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

const EVENT_ICON: Record<QuoteActivityEvent["kind"], typeof Eye> = {
  opened: Eye,
  selection_changed: ListChecks,
  optional_changed: ListChecks,
  pdf_downloaded: Download,
  approved: CheckCircle2,
  declined: XCircle,
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Quote activity (0117) — "Viewed 3 times · last opened 20 min ago · on
 * mobile", plus a "Going cold" flag; tap for the full list (newest first,
 * per quote version, latest version first). Internal only.
 */
export function QuoteActivityLine({ quote, className }: { quote: Pick<Quote, "id" | "status" | "sent_at" | "view_count" | "first_viewed_at" | "last_viewed_at" | "last_view_device" | "selections_changed_at">; className?: string }) {
  const [open, setOpen] = useState(false);
  const { data: settings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings, staleTime: 5 * 60_000 });
  const line = activityLine(quote);
  if (!line) return null;
  const cold = settings ? coldState(quote, settings) : null;
  const unopened = !(quote.view_count ?? 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground", className)}
      >
        {unopened ? <EyeOff className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0 text-info" />}
        <span className="min-w-0">{line}</span>
        {cold && (
          <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-bold text-info">
            <Snowflake className="h-3 w-3" />
            {coldLabel(cold)}
          </span>
        )}
      </button>
      {open && <QuoteActivityDialog quoteId={quote.id} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuoteActivityDialogInner({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["quote-activity", quoteId], queryFn: () => listQuoteActivity(quoteId) });
  const groups = data ? activityByVersion(data.sessions, data.events) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quote activity</DialogTitle>
          <DialogDescription>When and how your client engaged with this quote. Only you see this.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet — the client hasn't opened this quote.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              // One list per version: sessions as "Opened …" rows with their
              // time / sections, events in between — newest first.
              const rows = [
                ...g.events.filter((e) => e.kind !== "opened").map((e) => ({ at: e.created_at, key: e.id, event: e })),
                ...g.sessions.map((s) => ({ at: s.started_at, key: `s-${s.id}`, session: s })),
              ].sort((a, b) => b.at.localeCompare(a.at));
              return (
                <section key={g.version}>
                  {groups.length > 1 && (
                    <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
                      {g.version ? `Version ${g.version}` : "Earlier"}
                      {g.version === groups[0].version ? " · latest" : ""}
                    </h4>
                  )}
                  <ol className="divide-y divide-hairline">
                    {rows.map((r) => {
                      if ("session" in r && r.session) {
                        const s = r.session;
                        return (
                          <li key={r.key} className="py-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Opened on {s.device}</span> · {when(s.started_at)} ·{" "}
                            {s.channel === "hub" ? "Client Hub" : "quote link"} · ~{durationText(s.active_seconds)} active
                            {s.sections.length > 0 && <span className="block text-muted-subtle">Looked at: {s.sections.join(", ")}</span>}
                          </li>
                        );
                      }
                      const e = (r as { event: QuoteActivityEvent }).event;
                      const Icon = EVENT_ICON[e.kind] ?? Eye;
                      return (
                        <li key={r.key} className="flex items-start gap-2 py-2 text-sm">
                          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", e.kind === "approved" ? "text-success" : e.kind === "declined" ? "text-destructive" : "text-info")} />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground [overflow-wrap:anywhere]">{e.summary}</div>
                            <div className="text-xs text-muted-foreground">{when(e.created_at)}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const QuoteActivityDialog = withErrorBoundary(QuoteActivityDialogInner, "QuoteActivityDialog");

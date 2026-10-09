import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, CircleDollarSign, Eye, FileText, Flag, Receipt, XCircle, type LucideIcon } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { listProgressUpdates, listProjects, listRecentProjectEvents, type ProjectEventKind } from "@/lib/api";
import { projectHref } from "@/lib/projectTabs";
import { timeAgoShort } from "@/lib/quoteActivity";
import { cn } from "@/lib/utils";
import { Card, CardSkeleton, EmptyLine } from "./CardShell";

const ROWS = 8;

/** Activity-log kinds the feed shows, with their icon. */
const EVENT_ICON: Partial<Record<ProjectEventKind, LucideIcon>> = {
  quote_sent: FileText,
  quote_signed: CheckCircle2,
  quote_declined: XCircle,
  invoice_sent: Receipt,
  invoice_paid: CircleDollarSign,
  payment_received: CircleDollarSign,
  status_changed: Flag,
  project_started: Flag,
  change_order_approved: CheckCircle2,
  change_order_rejected: XCircle,
};
const EVENT_KINDS = Object.keys(EVENT_ICON) as ProjectEventKind[];
/** Client-side quote views come from notifications (the activity log only
 *  records what the contractor did). */
const VIEW_KINDS = new Set(["quote_first_open", "quote_viewed_again"]);
const GOOD = new Set<string>(["quote_signed", "invoice_paid", "payment_received", "change_order_approved"]);
const BAD = new Set<string>(["quote_declined", "change_order_rejected"]);

interface FeedRow {
  key: string;
  at: string;
  icon: LucideIcon;
  tone: "good" | "bad" | "neutral";
  text: string;
  context: string | null;
  amount: string | null;
  to: string;
}

/** "Payment received · $1,200.00" → text + amount, so money sits in its own column. */
function splitAmount(summary: string): { text: string; amount: string | null } {
  const m = summary.match(/^(.*?)\s*·\s*(−?\$[\d,]+(?:\.\d{2})?)$/);
  return m ? { text: m[1], amount: m[2] } : { text: summary, amount: null };
}

/**
 * The simplified Dashboard's one Recent activity list — replaces Recent
 * quotes, Recent invoices and Recent activity. Combines the project activity
 * log (quotes sent / signed, invoices, payments, status changes, change
 * orders), client quote views (notifications) and progress updates; newest
 * first, ~8 rows.
 */
export function ActivityFeedCard() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["recent-project-events", EVENT_KINDS.join(",")],
    queryFn: () => listRecentProjectEvents(40, EVENT_KINDS),
    staleTime: 60_000,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: updates = [] } = useQuery({ queryKey: ["progress-updates", "all"], queryFn: () => listProgressUpdates(), staleTime: 60_000 });
  const { notifications } = useNotifications();

  const rows = useMemo<FeedRow[]>(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const fromEvents = events.map<FeedRow>((e) => {
      const { text, amount } = splitAmount(e.summary);
      return {
        key: `e-${e.id}`,
        at: e.created_at,
        icon: EVENT_ICON[e.kind] ?? Flag,
        tone: GOOD.has(e.kind) ? "good" : BAD.has(e.kind) ? "bad" : "neutral",
        text,
        context: projectName.get(e.project_id) ?? null,
        amount,
        to: projectHref(e.project_id, "activity"),
      };
    });
    const fromViews = notifications
      .filter((n) => VIEW_KINDS.has(n.kind))
      .map<FeedRow>((n) => ({ key: `n-${n.id}`, at: n.created_at, icon: Eye, tone: "neutral", text: n.title, context: n.body ?? null, amount: null, to: n.link ?? "/notifications" }));
    const fromUpdates = updates
      .filter((u) => u.status !== "pending")
      .map<FeedRow>((u) => ({
        key: `u-${u.id}`,
        at: u.shared_at ?? u.created_at,
        icon: Camera,
        tone: "neutral",
        text: u.milestone ? `Progress update · ${u.milestone}` : "Progress update",
        context: u.project?.name ?? projectName.get(u.project_id) ?? null,
        amount: null,
        to: projectHref(u.project_id, "updates"),
      }));
    return [...fromEvents, ...fromViews, ...fromUpdates].sort((a, b) => b.at.localeCompare(a.at)).slice(0, ROWS);
  }, [events, projects, updates, notifications]);

  return (
    <Card title="Recent activity" viewAll={{ to: "/notifications", label: "View all →" }}>
      {isLoading ? (
        <CardSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyLine>No activity yet.</EmptyLine>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.key}>
                <Link to={r.to} className="flex min-h-[44px] items-center gap-3 px-4 py-2 hover:bg-muted/40">
                  <Icon className={cn("h-4 w-4 shrink-0", r.tone === "good" ? "text-success" : r.tone === "bad" ? "text-destructive" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{r.text}</span>
                    {r.context && <span className="block truncate text-xs text-muted-foreground">{r.context}</span>}
                  </span>
                  {r.amount && <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{r.amount}</span>}
                  <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">{timeAgoShort(r.at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { materialAlertSummary, type MaterialAlert } from "@/lib/materialTracking";

const SNOOZE_DAYS = 3;
const snoozeKey = (projectId: string) => `chq_material_alerts_snooze:${projectId}`;
const readSnooze = (projectId: string): number => {
  try {
    return Number(localStorage.getItem(snoozeKey(projectId)) ?? 0);
  } catch {
    return 0;
  }
};

interface Group {
  key: string;
  name: string;
  sectionId: string | null;
  alerts: MaterialAlert[];
}

/**
 * The material ordering alerts (0167: ordering only — using more than
 * planned is a quiet note on the line), as one slim line: "⚠ 30 not
 * purchased · job started 1d ago  Review ›". Review opens the alerts grouped
 * by Cost plan section (so two "Caps" lines make sense) — inline with a
 * capped height on desktop, a bottom sheet on phones. Each group can open
 * in the Cost plan or be marked ordered in one tap; each line links to its
 * Cost plan row. The whole bar can be snoozed for 3 days per project.
 * Renders nothing when there's nothing to say. On the Cost plan only (the
 * project page keeps materials to its one-line readiness summary).
 */
export function MaterialAlertsBar({
  projectId,
  alerts,
  sectionNames,
  context,
  onMarkOrdered,
  busy,
  className,
}: {
  projectId: string;
  alerts: MaterialAlert[];
  /** Cost plan section id → its name, for the groups. */
  sectionNames: Map<string, string>;
  /** Shown after the counts, e.g. "job started 1d ago" (only when something's not ordered). */
  context?: string | null;
  /** Logs one order for these lines (the group's not-ordered ones). */
  onMarkOrdered?: (lineIds: string[]) => void;
  busy?: boolean;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [snoozedUntil, setSnoozedUntil] = useState(() => readSnooze(projectId));

  const summary = materialAlertSummary(alerts);
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of alerts) {
      const key = a.sectionId ?? "__other__";
      const name = a.sectionId ? (sectionNames.get(a.sectionId) ?? "Section") : "Other";
      if (!map.has(key)) map.set(key, { key, name, sectionId: a.sectionId, alerts: [] });
      map.get(key)!.alerts.push(a);
    }
    return [...map.values()];
  }, [alerts, sectionNames]);

  if (alerts.length === 0 || snoozedUntil > Date.now()) return null;

  const snooze = () => {
    const until = Date.now() + SNOOZE_DAYS * 86_400_000;
    try {
      localStorage.setItem(snoozeKey(projectId), String(until));
    } catch {
      // private mode — snooze for this visit only
    }
    setSnoozedUntil(until);
    setOpen(false);
  };
  const toggleGroup = (key: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const summaryText = summary.map((x) => x.text).join(" · ");
  const showContext = context && summary.some((x) => x.key === "not_ordered");

  const list = (
    <div className="space-y-2">
      {groups.map((g) => {
        const gOpen = openGroups.has(g.key);
        const notOrderedIds = g.alerts.filter((a) => a.key === "not_ordered" && a.lineId).map((a) => a.lineId!);
        return (
          <div key={g.key} className="rounded-xl border border-hairline bg-card">
            <div className="px-3 py-2 sm:flex sm:items-center sm:gap-3">
              <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={gOpen} className="flex min-h-9 w-full min-w-0 items-center gap-1.5 text-left sm:w-auto sm:flex-1">
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-subtle transition-transform", !gOpen && "-rotate-90")} />
                <span className="min-w-0 sm:flex sm:items-baseline sm:gap-1.5">
                  <span className="block truncate text-sm font-semibold text-foreground">{g.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="hidden sm:inline">· </span>
                    {materialAlertSummary(g.alerts).map((x) => x.text).join(" · ")}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-4 pl-[22px] sm:pl-0">
              {g.sectionId && (
                <Link to={`/projects/${projectId}/materials#section-${g.sectionId}`} className="text-xs font-semibold text-primary hover:underline">
                  Open in cost plan
                </Link>
              )}
              {onMarkOrdered && notOrderedIds.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMarkOrdered(notOrderedIds)}
                  className="min-h-9 text-xs font-bold text-primary hover:underline disabled:opacity-50"
                >
                  Mark as purchased
                </button>
              )}
              </div>
            </div>
            {gOpen && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {g.alerts.map((a, i) => (
                  <li key={`${a.key}-${a.lineId ?? a.orderId ?? i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", a.key === "not_ordered" ? "text-muted-subtle" : "text-warning-strong")} />
                    {a.lineId ? (
                      <Link to={`/projects/${projectId}/materials#line-${a.lineId}`} className="min-w-0 flex-1 truncate text-foreground hover:underline">
                        {a.label}
                      </Link>
                    ) : (
                      <Link to={`/projects/${projectId}/material-orders`} className="min-w-0 flex-1 truncate text-foreground hover:underline">
                        {a.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-1">
        <button type="button" onClick={snooze} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Snooze {SNOOZE_DAYS} days
        </button>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-card border border-warning/40 bg-warning/5 px-3.5 py-2 text-left text-sm"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning-strong" />
        <span className="min-w-0 flex-1 truncate text-foreground">
          <span className="font-semibold">{summaryText}</span>
          {showContext && <span className="text-muted-foreground"> · {context}</span>}
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">Review</span>
        {isMobile ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
        ) : (
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-subtle transition-transform", open && "rotate-180")} />
        )}
      </button>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
            <SheetHeader className="text-left">
              <SheetTitle>Material alerts</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {summaryText}
                {showContext ? ` · ${context}` : ""}
              </p>
            </SheetHeader>
            <div className="mt-3">{list}</div>
          </SheetContent>
        </Sheet>
      ) : (
        open && <div className="mt-2 max-h-[45vh] overflow-y-auto rounded-card border border-warning/30 bg-warning/[0.03] p-2.5">{list}</div>
      )}
    </div>
  );
}

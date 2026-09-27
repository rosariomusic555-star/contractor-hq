import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimilarMatch } from "@/lib/similarJobs";
import { contextPhrase } from "@/lib/jobContext";

const dismissedKey = (key: string) => `similar-hint-dismissed:${key}`;
const isDismissed = (key: string) => {
  try {
    return sessionStorage.getItem(dismissedKey(key)) === "1";
  } catch {
    return false;
  }
};

/**
 * A compact, dismissible "similar jobs" insight (Feature 5). One line;
 * tap to expand to what was widened and the jobs it's based on (each links
 * to its project). Always says how many jobs. Internal only.
 */
export function SimilarJobsHint({
  hintKey,
  text,
  matches,
  widened,
  metric,
  footer,
  className,
}: {
  /** Stable per field / target, for "dismiss". */
  hintKey: string;
  text: ReactNode;
  matches: SimilarMatch[];
  widened: string[];
  /** The number this hint is about, per job ("0.09 tons/sq ft"). */
  metric: (m: SimilarMatch) => string | null;
  footer?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => isDismissed(hintKey));
  if (hidden || matches.length === 0) return null;
  return (
    <div className={cn("rounded-xl border border-info/30 bg-info/5 text-xs", className)}>
      <div className="flex items-start gap-1.5 px-2.5 py-2">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 flex-1 text-left text-foreground">
          {text}
          <ChevronDown className={cn("ml-1 inline h-3 w-3 text-muted-subtle transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try {
              sessionStorage.setItem(dismissedKey(hintKey), "1");
            } catch {
              // fine — just not remembered
            }
            setHidden(true);
          }}
          className="shrink-0 rounded p-0.5 text-muted-subtle hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="space-y-1.5 border-t border-info/20 px-2.5 py-2">
          {widened.length > 0 && <p className="text-muted-foreground">Widened to find enough jobs: {widened.join(" → ")}.</p>}
          <ul className="space-y-1">
            {matches.map((m) => (
              <li key={`${m.closeout.id}-${m.feature.feature_id}`} className="flex items-baseline justify-between gap-2">
                <Link to={`/projects/${m.closeout.project_id}`} className="min-w-0 truncate font-semibold text-primary hover:underline">
                  {m.closeout.project?.name ?? "Project"}
                </Link>
                <span className="shrink-0 text-right text-muted-foreground">
                  {[m.feature.size ? `${m.feature.size.toLocaleString()} ${m.feature.size_unit}` : null, contextPhrase(m.closeout.context, ["slope", "access", "soil"]), metric(m)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          {footer}
        </div>
      )}
    </div>
  );
}

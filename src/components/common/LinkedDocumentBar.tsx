import { Link2, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkedDocumentBarProps {
  /** What this bar links to, e.g. "quote" or "materials sheet" — drives the
   * unlinked label ("Not linked to a {targetLabel}") and the link button
   * ("Link a {targetLabel}"). */
  targetLabel: string;
  /** Null when nothing is linked yet. `label` is the exact text to show
   * (e.g. a sheet's name, or "Linked to $X quote") — the bar doesn't
   * template it, since the two callers show different things. `onOpen`
   * makes the label a clickable link to the linked document; omit it to
   * render plain text. */
  linked: { label: string; onOpen?: () => void } | null;
  onLink: () => void;
  onUnlink: () => void;
  /** Background/border to match the surrounding dark card exactly (e.g.
   * `bg-sidebar/95` or `bg-foreground/95`) — this bar has no color of its
   * own so it always reads as part of that card, not a separate strip. */
  className?: string;
}

/**
 * Full-width strip along the bottom of a dark card, pairing a quote with a
 * materials sheet once a project has more than one of either (see
 * needsExplicitDocumentLink) — used by both the Materials Sheet builder
 * (under its Total cost banner, linking to a quote) and the Quote builder
 * (under the Client/Project card, linking to a materials sheet). One
 * component so the two can never drift apart in styling or behavior.
 */
export function LinkedDocumentBar({ targetLabel, linked, onLink, onUnlink, className }: LinkedDocumentBarProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-white/10 px-5 py-2.5", className)}>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-background/70">
        {linked ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <Link2Off className="h-3.5 w-3.5 shrink-0" />}
        {linked ? (
          linked.onOpen ? (
            <button
              type="button"
              onClick={linked.onOpen}
              className="truncate font-bold text-background hover:underline"
            >
              {linked.label}
            </button>
          ) : (
            <span className="truncate">{linked.label}</span>
          )
        ) : (
          `Not linked to a ${targetLabel}`
        )}
      </span>
      <div className="flex shrink-0 items-center gap-3">
        {linked && (
          <button
            type="button"
            onClick={onUnlink}
            className="text-xs font-bold text-background/80 hover:text-background hover:underline"
          >
            Unlink
          </button>
        )}
        <button type="button" onClick={onLink} className="text-xs font-bold text-primary hover:underline">
          {linked ? `Change linked ${targetLabel}` : `Link a ${targetLabel}`}
        </button>
      </div>
    </div>
  );
}

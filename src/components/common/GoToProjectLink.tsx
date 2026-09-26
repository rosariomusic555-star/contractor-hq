import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoToProjectLinkProps {
  projectId: string;
  /** Kept for callers; leaving with unsaved edits is now guarded app-wide
   * ("Save changes before leaving?" — UnsavedChangesProvider). */
  isDirty?: boolean;
  /** "dark" sits on the Quote builder's Client/Project card; "light" sits
   * in a plain page header (Materials Sheet / Invoice builders). Same
   * component, same behavior — just matching the surrounding surface. */
  tone?: "light" | "dark";
  /** "overlay" = an invisible link stretched over its (relative) parent,
   * so a whole card is the link — the Quote builder's Project card. Give
   * other controls inside that card `relative z-10` to sit above it.
   * Default "link" = the small inline link used in page headers. */
  variant?: "link" | "overlay";
  className?: string;
}

/**
 * "Go to project" — shown in the same spot (next to/under the existing
 * project picker or project name) across the Quote builder, Materials
 * Sheet builder, and Invoice builder, only once the document actually has
 * a project (never for a standalone quote/invoice). A real <Link> (proper
 * href), so cmd/ctrl-click opens the project in a new tab like any other
 * link. Unsaved edits are covered by the app-wide leave guard.
 */
export function GoToProjectLink({ projectId, tone = "light", variant = "link", className }: GoToProjectLinkProps) {
  const href = `/projects/${projectId}`;

  return (
    <>
      <Link
        to={href}
        // Links only activate on Enter natively — Space works too for the card.
        onKeyDown={
          variant === "overlay"
            ? (e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }
            : undefined
        }
        aria-label={variant === "overlay" ? "Go to project" : undefined}
        title={variant === "overlay" ? "Go to project" : undefined}
        className={cn(
          variant === "overlay"
            ? "absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            : cn(
                "inline-flex items-center gap-1 text-xs font-bold hover:underline",
                tone === "dark" ? "text-background/70 hover:text-background" : "text-primary hover:text-primary/80",
              ),
          className,
        )}
      >
        {variant === "overlay" ? null : (
          <>
            Go to project
            <ArrowUpRight className="h-3.5 w-3.5" />
          </>
        )}
      </Link>
    </>
  );
}

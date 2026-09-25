import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface GoToProjectLinkProps {
  projectId: string;
  /** The builder's own unsaved-changes flag (e.g. `dirty.current`) — a
   * plain left-click while dirty is intercepted with a confirm dialog
   * instead of silently discarding. cmd/ctrl/middle-click (new tab) always
   * goes straight through since nothing in this tab gets discarded. */
  isDirty: boolean;
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
 * link — only a plain click while the builder is dirty is intercepted.
 */
export function GoToProjectLink({ projectId, isDirty, tone = "light", variant = "link", className }: GoToProjectLinkProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const href = `/projects/${projectId}`;

  return (
    <>
      <Link
        to={href}
        onClick={(e) => {
          if (isDirty && e.button === 0 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setConfirmOpen(true);
          }
        }}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes here. Leaving for the project now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(href)}>Discard and leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
  /** "button" = a full, clearly clickable secondary button ("Go to project
   * →") — the Quote builder's Project card. Default "link" = the small
   * inline link used in page headers. */
  variant?: "link" | "button";
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
        className={cn(
          variant === "button"
            ? cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-colors",
                tone === "dark"
                  ? "border border-white/25 text-background hover:bg-white/10"
                  : "border border-border text-foreground hover:bg-muted",
              )
            : cn(
                "inline-flex items-center gap-1 text-xs font-bold hover:underline",
                tone === "dark" ? "text-background/70 hover:text-background" : "text-primary hover:text-primary/80",
              ),
          className,
        )}
      >
        Go to project
        {variant === "button" ? <ArrowRight className="h-4 w-4" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
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

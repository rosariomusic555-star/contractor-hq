import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Crash containment. A render error in one component shows a friendly
 * "Something went wrong · Reload" in its place instead of React Router's
 * whole-page error screen:
 *  - RouteErrorPage — the errorElement for the root route and the app shell
 *    (a crashed page keeps the sidebar).
 *  - withErrorBoundary() (./withErrorBoundary) — wraps each dialog / sheet component, so a crash
 *    in one shows a small closable dialog and the page underneath lives on.
 * In development the error and its stack stay visible under the message.
 */

const isDev = import.meta.env.DEV;

const errorText = (error: unknown): string => {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}${error.data ? `\n${String(error.data)}` : ""}`;
  if (error instanceof Error) {
    const head = `${error.name}: ${error.message}`;
    // V8 stacks already start with "Name: message".
    return error.stack?.startsWith(head) ? error.stack : `${head}${error.stack ? `\n\n${error.stack}` : ""}`;
  }
  return String(error);
};

function DevDetails({ error }: { error: unknown }) {
  if (!isDev) return null;
  return (
    <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
      {errorText(error)}
    </pre>
  );
}

/** The message itself — shared by the page and dialog fallbacks. */
export function SomethingWentWrong({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={compact ? "text-center" : "mx-auto max-w-lg py-16 text-center"} role="alert">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning-strong">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h2 className="mt-3 text-lg font-bold text-foreground">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">This part of the page hit an error. Your saved work is safe.</p>
      <div className="mt-4 flex justify-center gap-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button onClick={() => window.location.reload()}>
          <RotateCw className="h-4 w-4" />
          Reload
        </Button>
      </div>
      <DevDetails error={error} />
    </div>
  );
}

/** errorElement for routes. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isDev) console.error("[RouteError]", error);
  return (
    <div className="min-h-[60vh] bg-background px-4">
      <SomethingWentWrong error={error} />
    </div>
  );
}

export interface DialogLikeProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

interface BoundaryState {
  error: unknown;
  /** The last `open` prop seen — reopening a crashed dialog tries again. */
  prevOpen: boolean | undefined;
}

export class DialogErrorBoundary extends Component<{ name: string; props: DialogLikeProps; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, prevOpen: this.props.props.open };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(next: { props: DialogLikeProps }, state: BoundaryState): Partial<BoundaryState> | null {
    if (next.props.open === state.prevOpen) return null;
    // Opened again after a crash → render it fresh.
    return { prevOpen: next.props.open, ...(next.props.open && state.error ? { error: null } : {}) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${this.props.name}] crashed`, error, info.componentStack);
  }

  private close = () => {
    this.setState({ error: null });
    this.props.props.onOpenChange?.(false);
    this.props.props.onClose?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Crashed while closed — nothing to show; the page carries on.
    if (this.props.props.open === false) return null;
    return (
      <Dialog open onOpenChange={(o) => !o && this.close()}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Something went wrong</DialogTitle>
          <SomethingWentWrong error={error} compact onRetry={() => this.setState({ error: null })} />
        </DialogContent>
      </Dialog>
    );
  }
}

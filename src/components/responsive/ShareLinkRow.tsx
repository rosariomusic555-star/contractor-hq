import { Copy, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, middleTruncate } from "@/lib/utils";

/**
 * A document's client link as one tidy row (Quote + Invoice builders): the
 * URL middle-truncated in a pill, with Share and Copy as 44px icon buttons.
 * Never wider than its container.
 */
export function ShareLinkRow({
  url,
  placeholder,
  onShare,
  onCopy,
  disabled,
  className,
}: {
  url: string | null;
  placeholder: string;
  onShare: () => void;
  /** Replaces the built-in clipboard copy (e.g. a builder that has to
   * create the link first). */
  onCopy?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 font-mono text-[13px] text-muted-foreground"
        title={url ?? undefined}
      >
        {url ? middleTruncate(url.replace(/^https?:\/\//, "")) : placeholder}
      </div>
      <button
        type="button"
        onClick={onShare}
        disabled={disabled}
        aria-label="Share link"
        title="Share"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        <Share2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={(!url && !onCopy) || disabled}
        onClick={() => {
          if (onCopy) return onCopy();
          if (!url) return;
          void navigator.clipboard?.writeText(url).then(
            () => toast({ title: "Link copied" }),
            () => toast({ title: "Couldn't copy — long-press the link instead", variant: "destructive" }),
          );
        }}
        aria-label="Copy link"
        title="Copy"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

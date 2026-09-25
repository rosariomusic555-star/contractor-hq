import type { LucideIcon } from "lucide-react";
import { Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small action in the toolbar row under a section's dark header — shared
 * by the Materials Sheet ("Calculate quantities", "Measurements available ·
 * Fill quantities") and the Quote builder ("Quick quote", "Measurements
 * available · Quick quote").
 *
 * `measurements`: the prompt version — a tinted pill that says the
 * project's site measurements can fill this in. Otherwise a plain
 * icon + label link. Click events never reach the card (no collapse/drag).
 */
export function SectionToolbarAction({
  icon: Icon,
  label,
  onClick,
  measurements,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  measurements?: boolean;
  className?: string;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (measurements) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          onClick();
        }}
        onPointerDown={stop}
        className={cn(
          "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20",
          className,
        )}
      >
        <Ruler className="h-3.5 w-3.5 text-primary" />
        Measurements available · <span className="font-bold text-primary">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onClick();
      }}
      onPointerDown={stop}
      className={cn("flex min-h-8 items-center gap-1.5 text-xs font-bold text-primary hover:underline", className)}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

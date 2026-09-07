import { AlertCircle, Bell, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_NEEDS_YOU } from "@/lib/demoData";

const toneChip: Record<(typeof DEMO_NEEDS_YOU)[number]["tone"], string> = {
  red: "bg-destructive/15 text-destructive",
  amber: "bg-warning/15 text-warning",
  green: "bg-success/15 text-success",
  grey: "bg-muted text-muted-foreground",
};

const toneIcon = {
  red: AlertCircle,
  amber: Bell,
  green: CheckCircle2,
  grey: FileText,
};

/**
 * "Needs you" action queue — overdue chases, deposit prompts, quote follow-ups.
 * Presentation-only; driven by demoData. Action buttons are inert for now.
 */
export function NeedsYou({ className }: { className?: string }) {
  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="text-base font-bold text-foreground">
        Needs you <span className="text-muted-foreground">· {DEMO_NEEDS_YOU.length}</span>
      </h3>

      <ul className="mt-3 divide-y divide-hairline">
        {DEMO_NEEDS_YOU.map((item) => {
          const Icon = toneIcon[item.tone];
          return (
            <li key={item.title} className="flex items-center gap-3 py-3 first:pt-1">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  toneChip[item.tone],
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
              <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">
                {item.action}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

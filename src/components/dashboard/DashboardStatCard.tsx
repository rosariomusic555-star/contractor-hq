import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases a number from its previous value to `target` over `duration` ms. */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const prev = useRef(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      prev.current = target;
      setValue(target);
      return;
    }
    const from = prev.current;
    prev.current = target;
    if (from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setValue(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

interface DashboardStatCardProps {
  title: string;
  /** Raw numeric value — the card animates a count-up to it. */
  value: number;
  /** Formats the (possibly fractional, mid-animation) value for display. */
  format: (n: number) => string;
  /** Month-over-month percentage change; renders a coloured pill when present. */
  trend?: number | null;
  /** Small caption under the value. */
  hint?: string;
  icon: LucideIcon;
  /** Icon chip tone. */
  accent?: "green" | "grey" | "amber";
  /** When set, the whole card links there with a hover cue. */
  to?: string;
  /** Entrance-animation stagger in ms. */
  delay?: number;
}

const accentChip: Record<NonNullable<DashboardStatCardProps["accent"]>, string> = {
  green: "bg-primary/15 text-primary group-hover:bg-primary/25",
  grey: "bg-[#687B85]/15 text-[#687B85] group-hover:bg-[#687B85]/25",
  amber: "bg-warning/15 text-warning group-hover:bg-warning/25",
};

export function DashboardStatCard({
  title,
  value,
  format,
  trend,
  hint,
  icon: Icon,
  accent = "green",
  to,
  delay = 0,
}: DashboardStatCardProps) {
  const shown = useCountUp(value);
  const hasTrend = trend != null && Number.isFinite(trend);
  const up = hasTrend && (trend as number) >= 0;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn("shrink-0 rounded-xl p-2.5 transition-colors duration-300", accentChip[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground tabular-nums">
        {format(shown)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {hasTrend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
              up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {up ? "+" : ""}
            {(trend as number).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>

      {/* accent underline that sweeps in on hover */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 rounded-b-2xl bg-primary transition-transform duration-300 group-hover:scale-x-100" />
    </>
  );

  const base =
    "group relative block overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_0_hsl(215_25%_15%/0.06)] transition-all duration-300 animate-fade-in [animation-fill-mode:backwards]";

  if (to) {
    return (
      <Link
        to={to}
        style={{ animationDelay: `${delay}ms` }}
        className={cn(base, "hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg")}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div style={{ animationDelay: `${delay}ms` }} className={base}>
      {inner}
    </div>
  );
}

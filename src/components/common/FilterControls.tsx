import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Desktop segmented control. */
export function FilterSegment<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={cn("filter-segment", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-active={opt.value === value}
          onClick={() => onChange(opt.value)}
          className="filter-segment-item"
        >
          {opt.label}
          {opt.count != null && <span className="ml-1.5 opacity-70">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Mobile horizontally-scrolling pill row. */
export function FilterPills<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <div className={cn("scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition-colors",
              active
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            {opt.label}
            {opt.count != null && <span className="ml-1.5 opacity-70">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

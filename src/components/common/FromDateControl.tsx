import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addDaysYmd } from "@/lib/upcoming";

/**
 * "Showing from: Today · Tomorrow · Next week · [date]" — the start date for
 * an upcoming list (Tasks, Appointments). Everything on or after it shows.
 */
export function FromDateControl({ value, onChange, today }: { value: string; onChange: (ymd: string) => void; today: string }) {
  const presets = [
    { label: "Today", ymd: today },
    { label: "Tomorrow", ymd: addDaysYmd(today, 1) },
    { label: "Next week", ymd: addDaysYmd(today, 7) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold text-muted-foreground">From</span>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onChange(p.ymd)}
          aria-pressed={value === p.ymd}
          className={cn(
            "h-9 rounded-full px-3 text-xs font-semibold transition-colors",
            value === p.ymd ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
      <Input
        type="date"
        aria-label="Show from date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 w-[9.5rem] text-xs"
      />
    </div>
  );
}

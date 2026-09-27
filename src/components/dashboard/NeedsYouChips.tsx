import { cn } from "@/lib/utils";
import { NEEDS_YOU_CATEGORIES, categoryOf, type NeedsYouCategory, type NeedsYouItem } from "@/lib/needsYou";

/** All / Jobs / Money / Clients / Crew — with counts; empty categories are hidden. */
export function NeedsYouChips({ items, value, onChange }: { items: NeedsYouItem[]; value: NeedsYouCategory | "all"; onChange: (v: NeedsYouCategory | "all") => void }) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(categoryOf(i), (counts.get(categoryOf(i)) ?? 0) + 1);
  const chips = [{ key: "all" as const, label: "All", n: items.length }, ...NEEDS_YOU_CATEGORIES.map((c) => ({ ...c, n: counts.get(c.key) ?? 0 })).filter((c) => c.n > 0)];
  if (chips.length <= 2) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filter">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          role="tab"
          aria-selected={value === c.key}
          onClick={() => onChange(c.key)}
          className={cn(
            "min-h-[32px] shrink-0 rounded-full border px-3 text-xs font-semibold",
            value === c.key ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label} <span className="tabular-nums opacity-70">{c.n}</span>
        </button>
      ))}
    </div>
  );
}

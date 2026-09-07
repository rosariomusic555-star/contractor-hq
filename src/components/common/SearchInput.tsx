import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Search field with a leading icon, styled to the design tokens. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-[0.625rem] border border-border bg-card px-3 text-sm",
        "focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-subtle"
      />
    </div>
  );
}

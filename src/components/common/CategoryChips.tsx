import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listCategories } from "@/lib/api";

interface CategoryChipsProps {
  categoryIds: string[];
  className?: string;
  /** Cap the number of chips shown, folding the rest into a "+N" chip —
   * for tight spaces like a Kanban card or Ongoing Jobs snapshot. Omit for
   * the full list (the opportunity/project detail pages). */
  max?: number;
}

/**
 * Read-only job-type chips — same Settings > Categories names the
 * CategoryMultiSelect editor uses, resolved from ids to names client-side.
 * Renders nothing (not an empty row) when there are no tags, so callers can
 * drop this in unconditionally.
 */
export function CategoryChips({ categoryIds, className, max }: CategoryChipsProps) {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const names = categoryIds.map((id) => nameById.get(id)).filter((n): n is string => !!n);
  if (names.length === 0) return null;

  const shown = max ? names.slice(0, max) : names;
  const extra = names.length - shown.length;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((name) => (
        <Badge key={name} variant="secondary" className="text-[10px] font-semibold">
          {name}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge variant="secondary" className="text-[10px] font-semibold">
          +{extra}
        </Badge>
      )}
    </div>
  );
}

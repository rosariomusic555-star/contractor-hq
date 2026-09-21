import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** A clickable `<data-table>` column header with a sort-direction chevron
 * — pairs with the `useSort()` hook. */
export function SortableTh({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("cursor-pointer select-none hover:text-foreground", className)} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

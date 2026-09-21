import { useMemo, useState } from "react";

/**
 * Reusable click-a-header sort for the Revenue detail pages' tables. Pass
 * a map of column key -> value extractor; clicking the same header again
 * flips direction, clicking a different one sorts by it (numeric columns
 * default to descending — biggest first reads better for money/counts;
 * text columns default to ascending).
 */
export function useSort<T>(
  rows: T[],
  columns: Record<string, (row: T) => number | string>,
  defaultKey: string,
  defaultDir: "asc" | "desc" = "desc",
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    const extractor = columns[sortKey];
    if (!extractor) return rows;
    const arr = [...rows].sort((a, b) => {
      const av = extractor(a);
      const bv = extractor(b);
      const cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir]);

  const toggle = (key: string, textColumn = false) => {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(textColumn ? "asc" : "desc");
    }
  };

  return { sorted, sortKey, dir, toggle };
}

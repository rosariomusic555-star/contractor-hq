import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/** A list page's search box, pre-filled from ?q= (global search's "See all")
 *  and refilled when a new ?q= arrives while the page is open. */
export function useSearchParamState(): [string, (v: string) => void] {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (q) setSearch(q);
  }, [q]);
  return [search, setSearch];
}

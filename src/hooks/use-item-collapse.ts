import { useAuth } from "@/lib/auth";
import { useSectionCollapse } from "@/hooks/use-section-collapse";

/**
 * Per-line-item collapse (compact row ↔ full item) for a builder — Cost
 * plan, Quote, Change Order. A view preference only: remembered in
 * localStorage per user and per document (`scope`, e.g. the cost plan's
 * id), never saved with the document and never an unsaved change.
 *
 * Items start expanded (a new line opens ready to fill in). The section and
 * page controls set many items at once; each item can still be toggled on
 * its own afterwards.
 */
export function useItemCollapse(scope: string) {
  const { session } = useAuth();
  const store = useSectionCollapse({ storageKey: `chq_item_collapse_v1:${session?.user?.id ?? "anon"}:${scope}` });
  const collapsedCount = (ids: string[]) => ids.filter((id) => store.isCollapsed(id)).length;
  return {
    isCollapsed: store.isCollapsed,
    toggle: store.toggle,
    collapse: (ids: string[]) => store.collapseAll(ids),
    expand: (ids: string[]) => store.expandAll(ids),
    /** Most of these items are collapsed — the section control then offers
     * "Expand"; otherwise (ties included) "Collapse". */
    mostlyCollapsed: (ids: string[]) => ids.length > 0 && collapsedCount(ids) > ids.length / 2,
    allCollapsed: (ids: string[]) => ids.length > 0 && collapsedCount(ids) === ids.length,
  };
}

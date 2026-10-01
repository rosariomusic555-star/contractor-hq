/** "Collapse all | Expand all" — the right-aligned text links above a list
 * of collapsible sections (Quote, Materials Sheet and Change Order builders,
 * the Measurements card). */
export function CollapseAllLinks({
  onCollapseAll,
  onExpandAll,
  items,
}: {
  onCollapseAll: () => void;
  onExpandAll: () => void;
  /** Builders: also "Collapse all line items" — headers and toolbars stay. */
  items?: { allCollapsed: boolean; onCollapseAll: () => void; onExpandAll: () => void };
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-bold text-primary">
      {items && (
        <>
          <button type="button" onClick={items.allCollapsed ? items.onExpandAll : items.onCollapseAll} className="hover:underline">
            {items.allCollapsed ? "Show all line items" : "Collapse all line items"}
          </button>
          <span className="text-border">|</span>
        </>
      )}
      <button type="button" onClick={onCollapseAll} className="hover:underline">
        Collapse all
      </button>
      <span className="text-border">|</span>
      <button type="button" onClick={onExpandAll} className="hover:underline">
        Expand all
      </button>
    </div>
  );
}

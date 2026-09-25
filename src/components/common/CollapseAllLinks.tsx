/** "Collapse all | Expand all" — the right-aligned text links above a list
 * of collapsible sections (Quote, Materials Sheet and Change Order builders,
 * the Measurements card). */
export function CollapseAllLinks({ onCollapseAll, onExpandAll }: { onCollapseAll: () => void; onExpandAll: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 text-xs font-bold text-primary">
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

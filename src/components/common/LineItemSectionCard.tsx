import type { ReactNode } from "react";
import type { SectionFeaturePicker } from "@/components/common/SectionNameField";
import { Droppable, Draggable, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SectionCard } from "@/components/common/SectionCard";
import { LineItemRow } from "@/components/common/LineItemRow";
import { formatCurrency } from "@/lib/utils";
import type { Category } from "@/lib/api";
import type { DraftLineItem, DraftLineSection } from "@/lib/draftLineItem";

interface LineItemSectionCardProps {
  section: DraftLineSection;
  subtotal: number;
  categories: Category[];
  onRename: (name: string) => void;
  onDeleteSection: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string, patch: Partial<DraftLineItem>) => void;
  onDeleteItem: (itemId: string) => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Moves the item at `itemIndex` (within this section) up/down one spot. */
  onMoveItem: (itemIndex: number, direction: -1 | 1) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isDraggingItem?: boolean;
  onAutoExpand?: () => void;
  /** Row label passed through to each item (see LineItemRow). */
  priceLabel?: string;
  /** Optional content under the section name in the dark header (the Quote
   * builder's project-type + materials chips). */
  tag?: ReactNode;
  /** Quote builder: the name field doubles as the feature picker. */
  featurePicker?: SectionFeaturePicker;
  /** Actions in the toolbar row under the header (the Quote builder's
   * "Quick quote") — same slot/style as the Materials Sheet's
   * "Calculate quantities" (SectionToolbarAction). */
  toolbarActions?: ReactNode;
  /** Quote-only: the "Optional section" switch + per-item optional-addon
   * toggle. Omitted entirely for a builder with no optional-item concept
   * (the Change Order builder — every line unconditionally counts). */
  /** Content above the line items (the Change Order builder's scope change). */
  beforeItems?: ReactNode;
  /** Content below the "add item" button (the Change Order builder's
   * planned-cost changes). */
  afterItems?: ReactNode;
  /** The add button's label — "Add item to this section" by default. */
  addItemLabel?: string;
  optionalSection?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Per-item toggle state/handler — keyed by item id. */
    isItemOptional: (itemId: string) => boolean;
    onToggleItem: (itemId: string, checked: boolean) => void;
  };
}

/**
 * A section's dark header + collapse/reorder chrome (SectionCard, shared
 * with the Materials Sheet builder) wrapping a drag-and-drop list of
 * LineItemRow line items. Shared by the Quote builder and the Change
 * Order builder — the only thing that differs between them is whether
 * `optionalSection` is supplied.
 */
export function LineItemSectionCard({
  section,
  subtotal,
  categories,
  onRename,
  onDeleteSection,
  onAddItem,
  onEditItem,
  onDeleteItem,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onMoveItem,
  collapsed,
  onToggleCollapse,
  isDraggingItem,
  onAutoExpand,
  priceLabel,
  optionalSection,
  tag,
  featurePicker,
  beforeItems,
  afterItems,
  addItemLabel = "Add item to this section",
  toolbarActions,
}: LineItemSectionCardProps) {
  const items = section.items;

  return (
    <SectionCard
      name={section.name}
      onRename={onRename}
      subtotal={subtotal}
      itemNames={items.map((i) => i.name)}
      tag={tag}
      featurePicker={featurePicker}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      isDraggingItem={isDraggingItem}
      onAutoExpand={onAutoExpand}
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      secondRow={
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {toolbarActions}
            {optionalSection && (
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Switch
                  checked={optionalSection.checked}
                  onCheckedChange={optionalSection.onChange}
                  aria-label="Optional section"
                />
                Optional section — client can add or drop it
              </label>
            )}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Delete section"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {items.length > 0
                    ? `Removes ${items.length} item${items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)}. Nothing is saved until you press Save changes.`
                    : "This section is empty."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDeleteSection}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    >
      {beforeItems}
      <Droppable droppableId={section.id} type="item">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                    <LineItemRow
                      item={item}
                      categories={categories}
                      onEdit={(patch) => onEditItem(item.id, patch)}
                      onDelete={() => onDeleteItem(item.id)}
                      dragHandleProps={dragProvided.dragHandleProps}
                      dragging={dragSnapshot.isDragging}
                      canMoveUp={index > 0}
                      canMoveDown={index < items.length - 1}
                      onMoveUp={() => onMoveItem(index, -1)}
                      onMoveDown={() => onMoveItem(index, 1)}
                      priceLabel={priceLabel}
                      optionalToggle={
                        optionalSection
                          ? {
                              checked: optionalSection.isItemOptional(item.id),
                              onChange: (checked) => optionalSection.onToggleItem(item.id, checked),
                              label: "Optional add-on — client chooses whether to include this line",
                            }
                          : undefined
                      }
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      <button
        type="button"
        onClick={onAddItem}
        className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
      >
        <Plus className="h-4 w-4" />
        {addItemLabel}
      </button>
      {afterItems}
    </SectionCard>
  );
}

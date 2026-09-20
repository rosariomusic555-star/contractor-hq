import type { DropResult } from "@hello-pangea/dnd";

export interface ReorderableItem {
  id: string;
}

export interface ReorderableSection<TItem extends ReorderableItem> {
  id: string;
  items: TItem[];
}

/**
 * Section/item drag-and-drop + arrow-button reordering, shared by the Quote
 * builder and Materials Sheet builder — both have the same shape (a list of
 * sections, each with its own list of line items, edited as a local draft
 * array via the same `edit(fn)` setter every other draft mutator already
 * uses). Reordering is just another local array mutation: the existing
 * draft/save pattern (see QuoteWorkspace/ProjectMaterialsView) diffs the
 * draft against the server and writes sort_order on save, so nothing here
 * talks to the network — moving something just updates the draft, same as
 * editing a field.
 *
 * Drag droppable/draggable ids: the outer sections Droppable uses a fixed
 * id (type "section"); each section's own items Droppable is keyed by that
 * section's id (type "item") — which is also how onDragEnd finds the
 * source/destination section when an item is dragged across sections.
 */
export function useSectionReorder<TItem extends ReorderableItem, TSection extends ReorderableSection<TItem>>(
  edit: (fn: (sections: TSection[]) => TSection[]) => void,
) {
  const moveSection = (index: number, direction: -1 | 1) => {
    edit((sections) => {
      const target = index + direction;
      if (target < 0 || target >= sections.length) return sections;
      const next = [...sections];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const moveItem = (sectionId: string, index: number, direction: -1 | 1) => {
    edit((sections) =>
      sections.map((s) => {
        if (s.id !== sectionId) return s;
        const target = index + direction;
        if (target < 0 || target >= s.items.length) return s;
        const items = [...s.items];
        [items[index], items[target]] = [items[target], items[index]];
        return { ...s, items };
      }),
    );
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === "section") {
      if (source.index === destination.index) return;
      edit((sections) => {
        const next = [...sections];
        const [moved] = next.splice(source.index, 1);
        next.splice(destination.index, 0, moved);
        return next;
      });
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    edit((sections) => {
      const next = sections.map((s) => ({ ...s, items: [...s.items] })) as TSection[];
      const fromSection = next.find((s) => s.id === source.droppableId);
      const toSection = next.find((s) => s.id === destination.droppableId);
      if (!fromSection || !toSection) return sections;
      const [moved] = fromSection.items.splice(source.index, 1);
      toSection.items.splice(destination.index, 0, moved);
      return next;
    });
  };

  return { moveSection, moveItem, onDragEnd };
}

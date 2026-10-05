import { useRef } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

type Section<I> = { id: string; items: I[] };

/** Removes a line from a builder's draft, remembering where it was. */
export function removeDraftLine<I extends { id: string }, S extends Section<I>>(
  sections: S[],
  sectionId: string,
  itemId: string,
): { sections: S[]; removed: { item: I; index: number } | null } {
  let removed: { item: I; index: number } | null = null;
  const next = sections.map((s) => {
    if (s.id !== sectionId) return s;
    const index = s.items.findIndex((i) => i.id === itemId);
    if (index < 0) return s;
    removed = { item: s.items[index], index };
    return { ...s, items: s.items.filter((i) => i.id !== itemId) };
  });
  return { sections: next, removed };
}

/** Puts a removed line back where it was (its section must still exist;
 * never adds it twice). */
export function restoreDraftLine<I extends { id: string }, S extends Section<I>>(
  sections: S[],
  sectionId: string,
  removed: { item: I; index: number },
): S[] {
  return sections.map((s) => {
    if (s.id !== sectionId || s.items.some((i) => i.id === removed.item.id)) return s;
    const items = [...s.items];
    items.splice(Math.min(removed.index, items.length), 0, removed.item);
    return { ...s, items };
  });
}

/**
 * "Line item deleted · Undo" for the builders' collapsed rows (Cost plan,
 * Quote, Change Order). The delete is an ordinary draft edit — it goes
 * through the usual unsaved-changes / Save flow — and Undo puts the line
 * back. `invalidate()` (call it on Save, or when the draft is reseeded)
 * makes a still-showing Undo do nothing, so a saved delete can't be undone
 * into a line the server no longer has.
 */
export function useLineDeleteUndo() {
  const { toast } = useToast();
  const generation = useRef(0);
  const dismissRef = useRef<(() => void) | null>(null);

  const announce = (onUndo: () => void) => {
    const at = ++generation.current;
    const { dismiss } = toast({
      title: "Line item deleted",
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            if (generation.current === at) onUndo();
          }}
        >
          Undo
        </ToastAction>
      ),
    });
    dismissRef.current = dismiss;
  };

  const invalidate = () => {
    generation.current++;
    dismissRef.current?.();
    dismissRef.current = null;
  };

  return { announce, invalidate };
}

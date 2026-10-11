import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ReactGridLayout, { moveElement, useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardErrorBoundary, EmptyLine, LazyMount } from "./CardShell";
import { DashCellContext, type DashCell } from "./dashCell";
import {
  GRID_COLS,
  GRID_GAP,
  ROW_HEIGHT,
  cardLabel,
  pxToRows,
  resolveGrid,
  resolvePhone,
  rowsToPx,
  sizeLimits,
  type DashboardLayoutState,
  type GridBreakpoint,
  type GridCardId,
  type SavedItem,
} from "./layout";

/** What a card says on the grid when it has nothing to show (these cards hide
 *  themselves elsewhere, which would leave an empty slot here). */
const EMPTY_TEXT: Partial<Record<GridCardId, string>> = {
  starting: "No jobs starting in the next 14 days.",
  activity: "No client activity this week.",
  weather: "No weather risks in the next 7 days.",
  crew: "No crew clocked in or set up yet.",
  pastclients: "No past-client follow-ups right now.",
};

// Elements are mostly not editable while editing — `inert` takes the card's
// content out of clicks, focus and the accessibility tree.
const INERT = { inert: "" } as Record<string, string>;

/** Natural height of a card in px: header + measured content (the Card
 *  shell's data-dash-content) + borders. `empty`: the card rendered nothing
 *  (then the empty-state stand-in is measured). */
function naturalHeight(wrapper: HTMLElement): { px: number | null; empty: boolean } {
  const children = Array.from(wrapper.children) as HTMLElement[];
  const real = children.find((el) => !el.dataset.dashFallback);
  const root = real ?? (children.find((el) => el.dataset.dashFallback)?.firstElementChild as HTMLElement | undefined);
  return { px: root ? sectionHeight(root) : null, empty: !real };
}

function sectionHeight(root: HTMLElement): number {
  const content = root.querySelector<HTMLElement>(":scope > div > [data-dash-content]");
  if (!content) return root.scrollHeight;
  const header = root.querySelector<HTMLElement>(":scope > header");
  return (header?.offsetHeight ?? 0) + content.offsetHeight + (root.offsetHeight - root.clientHeight);
}

/**
 * One card on the grid. Measures the card's content so a card whose height
 * isn't set by hand (auto) fits it; shows a short empty card when the card
 * rendered nothing.
 */
function CellBody({ id, editing, cell, onNatural, children }: { id: GridCardId; editing: boolean; cell: DashCell; onNatural: (id: GridCardId, px: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);

  useLayoutEffect(() => {
    const wrapper = ref.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    // Not requestAnimationFrame: it's paused in background tabs, and the
    // observers already batch their callbacks.
    const measure = () => {
      const { px, empty } = naturalHeight(wrapper);
      setEmpty(empty);
      if (px !== null) onNatural(id, px);
    };
    const ro = new ResizeObserver(measure);
    const bind = () => {
      ro.disconnect();
      wrapper.querySelectorAll(":scope > *, :scope section > header, :scope section > div > [data-dash-content]").forEach((el) => ro.observe(el));
      measure();
    };
    const mo = new MutationObserver(bind);
    mo.observe(wrapper, { childList: true, subtree: true });
    bind();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [id, onNatural]);

  return (
    <DashCellContext.Provider value={cell}>
      <div ref={ref} className="h-full" {...(editing ? INERT : {})}>
        <CardErrorBoundary title={cardLabel(id)}>{children}</CardErrorBoundary>
        {empty && (
          <div data-dash-fallback className="h-full">
            <Card title={cardLabel(id)}>
              <EmptyLine>{EMPTY_TEXT[id] ?? "Nothing to show right now."}</EmptyLine>
            </Card>
          </div>
        )}
      </div>
    </DashCellContext.Provider>
  );
}

/** Columns overlap (for finding the card above / below). */
const overlapsX = (a: LayoutItem, b: LayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * The Dashboard's 12-column card grid (react-grid-layout). Cards compact
 * upward; in edit mode they drag by the header strip and resize from the
 * bottom-right corner, or move with the arrow keys / resize with Shift +
 * arrows. Every change is handed to `onChange` (saved by the parent).
 */
export function DashboardGrid({
  bp,
  state,
  editing,
  render,
  onChange,
  announce,
}: {
  bp: GridBreakpoint;
  state: DashboardLayoutState;
  editing: boolean;
  render: (id: GridCardId) => ReactNode;
  onChange: (next: DashboardLayoutState) => void;
  announce: (message: string) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const items = useMemo(() => resolveGrid(state, bp), [state, bp]);
  // Content heights of auto cards, in rows (measured, never saved).
  const [autoRows, setAutoRows] = useState<Partial<Record<GridCardId, number>>>({});
  const onNatural = useCallback((id: GridCardId, px: number) => {
    const rows = pxToRows(px);
    setAutoRows((prev) => (prev[id] === rows ? prev : { ...prev, [id]: rows }));
  }, []);

  const layout: LayoutItem[] = useMemo(
    () =>
      items.map((it) => {
        const lim = sizeLimits(it.i, bp);
        const h = it.auto ? Math.min(Math.max(autoRows[it.i] ?? it.h, lim.minH), lim.maxH) : it.h;
        return { i: it.i, x: it.x, y: it.y, w: it.w, h, ...lim };
      }),
    [items, autoRows, bp],
  );

  /** Saves a new arrangement; a card resized by hand stops fitting its content. */
  const commit = (next: Layout, resized: string | null) => {
    if (!editing) return false;
    const changed = next.some((l) => {
      const before = layout.find((o) => o.i === l.i);
      return !before || before.x !== l.x || before.y !== l.y || before.w !== l.w || before.h !== l.h;
    });
    if (!changed) return false;
    const saved: SavedItem[] = next.map((l) => {
      const prev = items.find((it) => it.i === l.i);
      const auto = !!prev?.auto && l.i !== resized;
      return { i: l.i as GridCardId, x: l.x, y: l.y, w: l.w, h: l.h, ...(auto ? { auto: true } : {}) };
    });
    onChange({ ...state, [bp]: saved });
    return true;
  };

  const colWidth = (width - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

  const onKey = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editing || e.target !== e.currentTarget || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    let next: Layout = layout.map((l) => ({ ...l }));
    const it = next.find((l) => l.i === id)!;
    const label = cardLabel(id as GridCardId);
    let resized: string | null = null;
    if (e.shiftKey) {
      const lim = sizeLimits(id as GridCardId, bp);
      const dw = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const dh = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      const mutable = it as { w: number; h: number; x: number };
      mutable.w = Math.min(Math.max(it.w + dw, lim.minW), lim.maxW, GRID_COLS - it.x);
      mutable.h = Math.min(Math.max(it.h + dh, lim.minH), lim.maxH);
      resized = id;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const x = Math.min(Math.max(it.x + (e.key === "ArrowRight" ? 1 : -1), 0), GRID_COLS - it.w);
      next = moveElement(next, it, x, it.y, true, false, "vertical", GRID_COLS);
    } else if (e.key === "ArrowUp") {
      // Jump above the nearest card above (it moves down).
      const above = next.filter((o) => o.i !== id && o.y + o.h <= it.y && overlapsX(o, it)).sort((a, b) => b.y - a.y)[0];
      if (above) next = moveElement(next, it, it.x, above.y, true, false, "vertical", GRID_COLS);
    } else if (e.key === "ArrowDown") {
      // Swap with the nearest card below (it moves up into this spot).
      const below = next.filter((o) => o.i !== id && o.y >= it.y + it.h && overlapsX(o, it)).sort((a, b) => a.y - b.y)[0];
      if (below) next = moveElement(next, below, below.x, it.y, true, false, "vertical", GRID_COLS);
    }
    next = verticalCompactor.compact(next, GRID_COLS);
    const after = next.find((l) => l.i === id)!;
    if (commit(next, resized))
      announce(
        resized ? `${label} resized to ${after.w} of ${GRID_COLS} columns by ${after.h} rows.` : `${label} moved to column ${after.x + 1}, row ${after.y + 1}.`,
      );
    else announce(`${label} can't go further that way.`);
  };

  return (
    <div ref={containerRef} className={cn("dash-grid", editing && "dash-grid-editing")}>
      {mounted && width > 0 && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [GRID_GAP, GRID_GAP], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editing, handle: ".dash-drag-handle" }}
          resizeConfig={{ enabled: editing, handles: ["se"] }}
          compactor={verticalCompactor}
          onDragStop={(next) => commit(next, null)}
          onResizeStop={(next, _old, item) => commit(next, item?.i ?? null)}
        >
          {layout.map((l) => {
            const it = items.find((x) => x.i === l.i)!;
            const id = l.i as GridCardId;
            const cell: DashCell = { sized: !it.auto, w: l.w, widthPx: l.w * colWidth + (l.w - 1) * GRID_GAP, heightPx: rowsToPx(l.h) };
            return (
              <div
                key={id}
                className={cn("dash-cell", editing && "dash-cell-editing")}
                tabIndex={editing ? 0 : undefined}
                role={editing ? "group" : undefined}
                aria-roledescription={editing ? "Movable card" : undefined}
                aria-label={editing ? `${cardLabel(id)}. ${l.w} columns by ${l.h} rows. Arrow keys move, Shift + arrow keys resize.` : undefined}
                onKeyDown={onKey(id)}
              >
                <CellBody id={id} editing={editing} cell={cell} onNatural={onNatural}>
                  {render(id)}
                </CellBody>
                {editing && (
                  <div className="dash-drag-handle absolute inset-x-0 top-0 z-10 flex h-11 cursor-move items-center justify-end rounded-t-card pr-2" title={`Drag to move ${cardLabel(id)}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border">
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </ReactGridLayout>
      )}
    </div>
  );
}

/**
 * Phones: one full-width column. In edit mode each card gets Move up / Move
 * down buttons (no free drag or resize); the order is saved on its own.
 */
export function PhoneCardList({
  state,
  editing,
  render,
  onChange,
  announce,
}: {
  state: DashboardLayoutState;
  editing: boolean;
  render: (id: GridCardId) => ReactNode;
  onChange: (next: DashboardLayoutState) => void;
  announce: (message: string) => void;
}) {
  const order = resolvePhone(state);
  const move = (id: GridCardId, dir: -1 | 1) => {
    const next = [...order];
    const i = next.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...state, phone: next });
    announce(`${cardLabel(id)} moved to position ${j + 1} of ${next.length}.`);
  };
  // Keep focus on the button that was pressed as its card moves.
  const lastMoved = useRef<string | null>(null);
  useEffect(() => {
    if (!lastMoved.current) return;
    document.getElementById(lastMoved.current)?.focus();
    lastMoved.current = null;
  });
  return (
    <div className="space-y-3">
      {order.map((id, i) => (
        <div key={id} className={cn(editing && "rounded-card outline-dashed outline-2 outline-offset-4 outline-border")}>
          {editing && (
            <div className="mb-2 flex items-center gap-1">
              <span className="flex-1 truncate text-sm font-semibold text-foreground">{cardLabel(id)}</span>
              <Button
                id={`dash-up-${id}`}
                variant="soft"
                size="icon"
                className="h-11 w-11"
                disabled={i === 0}
                aria-label={`Move ${cardLabel(id)} up`}
                onClick={() => {
                  lastMoved.current = i - 1 === 0 ? `dash-down-${id}` : `dash-up-${id}`;
                  move(id, -1);
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                id={`dash-down-${id}`}
                variant="soft"
                size="icon"
                className="h-11 w-11"
                disabled={i === order.length - 1}
                aria-label={`Move ${cardLabel(id)} down`}
                onClick={() => {
                  lastMoved.current = i + 1 === order.length - 1 ? `dash-up-${id}` : `dash-down-${id}`;
                  move(id, 1);
                }}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div {...(editing ? INERT : {})}>
            <CardErrorBoundary title={cardLabel(id)}>
              <LazyMount eager={i < 3}>{render(id)}</LazyMount>
            </CardErrorBoundary>
          </div>
        </div>
      ))}
    </div>
  );
}

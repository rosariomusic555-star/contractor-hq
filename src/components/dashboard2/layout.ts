import { SIMPLE_EXTRAS, type SimpleExtraId } from "./prefs";

/**
 * The simplified Dashboard's editable grid layout (Edit layout) — the saved
 * shape, the default, and the size rules. Pure functions; the hook that loads
 * and saves it is useDashboardLayout.ts.
 *
 * Desktop (lg, ≥1024px) and tablet (md, 768–1023px) each have their own
 * 12-column layout; phones keep one column and only save the card order.
 * A breakpoint with nothing saved is derived from the default.
 */

export type MainCardId = "schedule" | "needs" | "pipeline" | "ongoing" | "recent";
export type GridCardId = MainCardId | SimpleExtraId;
export type GridBreakpoint = "lg" | "md";

/** One card's place on a breakpoint's grid. `auto`: the height follows the
 *  card's content (until the user resizes it). */
export interface SavedItem {
  i: GridCardId;
  x: number;
  y: number;
  w: number;
  h: number;
  auto?: boolean;
}

export interface DashboardLayoutState {
  v: 1;
  /** Optional cards shown (Add card / Customize). */
  extras: SimpleExtraId[];
  lg?: SavedItem[];
  md?: SavedItem[];
  /** Phone card order. */
  phone?: GridCardId[];
}

export const GRID_COLS = 12;
export const ROW_HEIGHT = 40;
/** Matches the cards' gap-4 elsewhere. */
export const GRID_GAP = 16;

export const MAIN_CARDS: { id: MainCardId; label: string }[] = [
  { id: "schedule", label: "Schedule" },
  { id: "needs", label: "Needs your attention" },
  { id: "pipeline", label: "Pipeline" },
  { id: "ongoing", label: "Ongoing projects" },
  { id: "recent", label: "Recent activity" },
];

/** Revenue overview is part of the default layout; the rest start off. */
export const DEFAULT_EXTRAS: SimpleExtraId[] = ["revenue"];

export function cardLabel(id: GridCardId): string {
  return MAIN_CARDS.find((c) => c.id === id)?.label ?? SIMPLE_EXTRAS.find((x) => x.id === id)?.label ?? id;
}

/** Min / max size in grid units on desktop (12 columns). Heights: 1 row =
 *  40px + 16px gap. Max height keeps a card from swallowing the page. */
export const CARD_SIZES: Record<GridCardId, { minW: number; minH: number; maxH?: number }> = {
  schedule: { minW: 3, minH: 3 },
  needs: { minW: 3, minH: 3 },
  pipeline: { minW: 3, minH: 3 },
  ongoing: { minW: 6, minH: 5 },
  recent: { minW: 4, minH: 3 },
  revenue: { minW: 6, minH: 6 },
  starting: { minW: 4, minH: 2 },
  activity: { minW: 4, minH: 2 },
  bookings: { minW: 4, minH: 2 },
  weather: { minW: 3, minH: 2 },
  crew: { minW: 3, minH: 2 },
  money: { minW: 3, minH: 2 },
  pastclients: { minW: 3, minH: 2 },
};
export const MAX_H = 24;

/** Size limits on a breakpoint: tablets are about half as wide, so a card
 *  needs twice the columns there. */
export function sizeLimits(id: GridCardId, bp: GridBreakpoint) {
  const s = CARD_SIZES[id];
  const minW = bp === "lg" ? s.minW : Math.min(GRID_COLS, s.minW * 2);
  return { minW, maxW: GRID_COLS, minH: s.minH, maxH: s.maxH ?? MAX_H };
}

/** A starting height before the content is measured (auto cards then fit). */
const GUESS_H: Partial<Record<GridCardId, number>> = { schedule: 8, needs: 6, pipeline: 5, ongoing: 7, revenue: 7, recent: 9 };
const guessH = (id: GridCardId) => Math.max(GUESS_H[id] ?? 4, CARD_SIZES[id].minH);

/** Turns a content height in px into grid rows. */
export function pxToRows(px: number): number {
  return Math.max(1, Math.ceil((px + GRID_GAP) / (ROW_HEIGHT + GRID_GAP)));
}
/** A card's height in px for a number of rows. */
export function rowsToPx(rows: number): number {
  return rows * ROW_HEIGHT + (rows - 1) * GRID_GAP;
}

function orderedExtras(extras: SimpleExtraId[], ...columns: ("left" | "right" | "full")[]) {
  return SIMPLE_EXTRAS.filter((x) => columns.includes(x.column) && extras.includes(x.id));
}

/** The one-column order (phones, and the tablet default): what needs doing
 *  first, then the rest. */
export function defaultOrder(extras: SimpleExtraId[]): GridCardId[] {
  return [
    "needs",
    "schedule",
    "ongoing",
    "pipeline",
    ...orderedExtras(extras, "left", "full").map((x) => x.id),
    ...orderedExtras(extras, "right").map((x) => x.id),
    "recent",
  ];
}

/**
 * The default grid. Desktop: Schedule (8) | Needs your attention + Pipeline
 * (4); Ongoing projects full width; optional cards in their wide / narrow
 * columns; Revenue overview and Recent activity full width. Tablet: every
 * card full width in the one-column order. Rows here are only an order — the
 * grid compacts everything upward.
 */
export function defaultGrid(bp: GridBreakpoint, extras: SimpleExtraId[]): SavedItem[] {
  if (bp === "md") return defaultOrder(extras).map((i, n) => ({ i, x: 0, y: n * 10, w: GRID_COLS, h: guessH(i), auto: true }));
  const item = (i: GridCardId, x: number, y: number, w: number): SavedItem => ({ i, x, y, w, h: guessH(i), auto: true });
  return [
    item("schedule", 0, 0, 8),
    item("needs", 8, 0, 4),
    item("pipeline", 8, 1, 4),
    item("ongoing", 0, 100, 12),
    ...orderedExtras(extras, "left").map((x, n) => item(x.id, 0, 200 + n, 8)),
    ...orderedExtras(extras, "right").map((x, n) => item(x.id, 8, 200 + n, 4)),
    ...orderedExtras(extras, "full").map((x, n) => item(x.id, 0, 300 + n, 12)),
    item("recent", 0, 400, 12),
  ];
}

export function visibleIds(extras: SimpleExtraId[]): GridCardId[] {
  return [...MAIN_CARDS.map((c) => c.id), ...SIMPLE_EXTRAS.filter((x) => extras.includes(x.id)).map((x) => x.id)];
}

const bottom = (items: SavedItem[]) => items.reduce((m, it) => Math.max(m, it.y + it.h), 0);

/** A new card dropped in at the bottom: its default width, full height guess. */
function appended(items: SavedItem[], id: GridCardId, bp: GridBreakpoint, extras: SimpleExtraId[]): SavedItem {
  const d = defaultGrid(bp, [...extras, id as SimpleExtraId]).find((x) => x.i === id)!;
  return { ...d, y: bottom(items) };
}

/** The layout to show on a breakpoint: the saved one (or the default), only
 *  the visible cards, any missing card added at the bottom, sizes kept inside
 *  the card's limits. */
export function resolveGrid(state: DashboardLayoutState, bp: GridBreakpoint): SavedItem[] {
  const visible = visibleIds(state.extras);
  const saved = state[bp];
  if (!saved) return defaultGrid(bp, state.extras);
  const items = saved.filter((it, n) => visible.includes(it.i) && saved.findIndex((o) => o.i === it.i) === n);
  for (const id of visible) if (!items.some((it) => it.i === id)) items.push(appended(items, id, bp, state.extras));
  return items.map((it) => {
    const lim = sizeLimits(it.i, bp);
    const w = Math.min(Math.max(it.w, lim.minW), lim.maxW);
    return { ...it, w, x: Math.min(Math.max(0, it.x), GRID_COLS - w), y: Math.max(0, it.y), h: Math.min(Math.max(it.h, lim.minH), lim.maxH) };
  });
}

export function resolvePhone(state: DashboardLayoutState): GridCardId[] {
  const visible = visibleIds(state.extras);
  if (!state.phone) return defaultOrder(state.extras);
  const order = state.phone.filter((id, n) => visible.includes(id) && state.phone!.indexOf(id) === n);
  for (const id of defaultOrder(state.extras)) if (!order.includes(id)) order.push(id);
  return order;
}

/** Turns optional cards on / off: a new card drops in at the bottom of every
 *  saved layout; a removed one leaves (the grid closes the gap). */
export function withExtras(state: DashboardLayoutState, extras: SimpleExtraId[]): DashboardLayoutState {
  const added = extras.filter((id) => !state.extras.includes(id));
  const next: DashboardLayoutState = { ...state, extras };
  // A layout still on the default is written out first, so the new card
  // goes below everything rather than into its default column.
  for (const bp of ["lg", "md"] as const) {
    if (!state[bp] && added.length === 0) continue;
    const items = (state[bp] ?? defaultGrid(bp, state.extras)).filter((it) => visibleIds(extras).includes(it.i));
    for (const id of added) items.push(appended(items, id, bp, extras));
    next[bp] = items;
  }
  if (state.phone || added.length) next.phone = [...resolvePhone(state).filter((id) => visibleIds(extras).includes(id)), ...added];
  return next;
}

export function defaultState(extras: SimpleExtraId[] = DEFAULT_EXTRAS): DashboardLayoutState {
  return { v: 1, extras: [...extras] };
}

const KNOWN = new Set<string>([...MAIN_CARDS.map((c) => c.id), ...SIMPLE_EXTRAS.map((x) => x.id)]);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback);

function parseItems(raw: unknown): SavedItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && KNOWN.has(String((r as { i?: unknown }).i)))
    .map((r) => ({ i: r.i as GridCardId, x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, GRID_COLS), h: num(r.h, 4), ...(r.auto ? { auto: true } : {}) }));
}

/** Reads a saved layout (the DB row or the local copy); null when it isn't one. */
export function parseLayoutState(raw: unknown): DashboardLayoutState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !Array.isArray(r.extras)) return null;
  const extrasKnown = new Set<string>(SIMPLE_EXTRAS.map((x) => x.id));
  const state: DashboardLayoutState = { v: 1, extras: [...new Set(r.extras as string[])].filter((id): id is SimpleExtraId => extrasKnown.has(id)) };
  const lg = parseItems(r.lg);
  const md = parseItems(r.md);
  if (lg) state.lg = lg;
  if (md) state.md = md;
  if (Array.isArray(r.phone)) state.phone = (r.phone as string[]).filter((id): id is GridCardId => KNOWN.has(id));
  return state;
}

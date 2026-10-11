import { createContext, useContext } from "react";

/**
 * Set by the Dashboard grid (Edit layout) around each card: the card's size,
 * so its content can adapt — more tiles when wider, more rows when the user
 * made it taller (`sized`: resized by hand, not fitted to its content).
 * Null outside the grid.
 */
export interface DashCell {
  sized: boolean;
  /** Width in grid columns (of 12). */
  w: number;
  widthPx: number;
  heightPx: number;
}
export const DashCellContext = createContext<DashCell | null>(null);
export const useDashCell = () => useContext(DashCellContext);

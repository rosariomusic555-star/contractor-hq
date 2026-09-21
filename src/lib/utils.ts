import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Whole-dollar currency, no cents — "$73,000" not "$73,000.00". For dense
 * summary tiles (e.g. the Bookings card's month tiles) where the
 * decimals never mattered and were pushing larger amounts past the tile's
 * width. Rounds to the nearest dollar. */
export function formatCurrencyWhole(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** "1 client", "3 clients". Pass an explicit plural for irregular words. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

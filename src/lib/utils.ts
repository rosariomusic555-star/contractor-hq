import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number): string {
  // A true minus sign ("−$250.00"), same as the hand-signed amounts
  // ("−$1,350") elsewhere — toLocaleString gives a hyphen.
  return (Number.isFinite(n) ? n : 0)
    .toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })
    .replace(/^-/, "−");
}

/** Whole-dollar currency, no cents — "$73,000" not "$73,000.00". For dense
 * summary tiles (e.g. the Bookings card's month tiles) where the
 * decimals never mattered and were pushing larger amounts past the tile's
 * width. Rounds to the nearest dollar. */
export function formatCurrencyWhole(n: number): string {
  return (Number.isFinite(n) ? n : 0)
    .toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    .replace(/^-/, "−");
}

/** "1 client", "3 clients". Pass an explicit plural for irregular words. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** US numbers (10 digits, or 11 starting with 1) as "(704) 438-5903";
 * anything else is shown as entered. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (us.length !== 10) return phone.trim();
  return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}

/** `tel:` href — punctuation stripped; US numbers get +1. */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}

/** "Sep 28, 2026" — for a date-only value ("2026-09-28", read as that local
 * day, never shifted by the UTC offset) or a timestamp. Blank → "—". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

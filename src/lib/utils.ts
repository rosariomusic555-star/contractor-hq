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

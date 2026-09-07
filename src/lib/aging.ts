import type { Invoice } from "./api";

const DAY = 86_400_000;

const parseDue = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/**
 * Days an invoice is past its due date. Negative = not due yet, 0 = no due
 * date or not applicable (paid / draft). Real, derived from `due_date`.
 */
export function invoiceDaysLate(
  inv: Pick<Invoice, "due_date" | "status">,
  now: Date = new Date(),
): number {
  if (!inv.due_date || inv.status === "paid" || inv.status === "draft") return 0;
  return Math.floor((now.getTime() - parseDue(inv.due_date).getTime()) / DAY);
}

export interface AgingBucket {
  key: "current" | "d1_30" | "d31_60" | "d60";
  label: string;
  amount: number;
  count: number;
}

/** Buckets the outstanding (sent + overdue) invoices by how late they are. */
export function agingBuckets(invoices: Invoice[], now: Date = new Date()): AgingBucket[] {
  const buckets: Record<AgingBucket["key"], AgingBucket> = {
    current: { key: "current", label: "Current", amount: 0, count: 0 },
    d1_30: { key: "d1_30", label: "1–30 days", amount: 0, count: 0 },
    d31_60: { key: "d31_60", label: "31–60 days", amount: 0, count: 0 },
    d60: { key: "d60", label: "60+ days", amount: 0, count: 0 },
  };
  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    const late = invoiceDaysLate(inv, now);
    const b = late <= 0 ? buckets.current : late <= 30 ? buckets.d1_30 : late <= 60 ? buckets.d31_60 : buckets.d60;
    b.amount += Number(inv.amount);
    b.count += 1;
  }
  return [buckets.current, buckets.d1_30, buckets.d31_60, buckets.d60];
}

/** Count of outstanding invoices more than `days` past due. */
export function overdueCount(invoices: Invoice[], days = 30, now: Date = new Date()): number {
  return invoices.filter(
    (i) => (i.status === "sent" || i.status === "overdue") && invoiceDaysLate(i, now) > days,
  ).length;
}

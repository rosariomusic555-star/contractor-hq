import { CheckCheck, Clock, DollarSign, Timer } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { compactMoney, count } from "@/lib/bannerMetrics";
import { fmtHours, payrollRow, r2, type TimesheetFlag } from "@/lib/timesheets";
import { formatCurrency } from "@/lib/utils";

/** `clocked_in` is a tile-only filter. */
export type TimesheetChip = "waiting" | "missing_out" | "clocked_in";

/** A Timesheets page row (one per employee for the period). */
export interface TimesheetBannerRow {
  status: string;
  flags: Pick<TimesheetFlag, "kind">[];
  totals: { total: number };
}

type SheetLike = {
  employee_id: string;
  entries?: { entry_date: string; hours: number; reg_hours?: number | null; ot_hours?: number | null; hourly_rate?: number | null }[];
};

export function timesheetChipMatch(r: TimesheetBannerRow, chip: TimesheetChip): boolean {
  switch (chip) {
    case "waiting":
      return r.status === "submitted";
    case "missing_out":
      return r.flags.some((f) => f.kind === "missing_out");
    case "clocked_in":
      return r.flags.some((f) => f.kind === "running");
  }
}

/** Gross pay for a period's sheets — PayrollView's rule (payrollRow). */
export function periodLaborCost(sheets: SheetLike[], otMultiplier: number): { gross: number; missingRate: boolean } {
  let gross = 0;
  let missingRate = false;
  for (const s of sheets) {
    const row = payrollRow(
      s.employee_id,
      "",
      (s.entries ?? []).map((e) => ({ entry_date: e.entry_date, hours: Number(e.hours), reg_hours: e.reg_hours ?? null, ot_hours: e.ot_hours ?? null, hourly_rate: e.hourly_rate ?? null })),
      otMultiplier,
    );
    gross += row.gross;
    missingRate ||= row.missingRate;
  }
  return { gross: r2(gross), missingRate };
}

const hoursOf = (sheets: SheetLike[]) => r2(sheets.reduce((s, sh) => s + (sh.entries ?? []).reduce((a, e) => a + Number(e.hours ?? 0), 0), 0));

export function useTimesheetsBanner({
  rows,
  sheets,
  prevSheets,
  otMultiplier,
  isCurrent,
  loading,
  chip,
  setChip,
}: {
  rows: TimesheetBannerRow[];
  sheets: SheetLike[];
  /** The period before — null while it loads (no comparison shown). */
  prevSheets: SheetLike[] | null;
  otMultiplier: number;
  /** The period on screen includes today (clocked-in only means anything then). */
  isCurrent: boolean;
  loading: boolean;
  chip: TimesheetChip | null;
  setChip: (c: TimesheetChip | null) => void;
}): { rich: RichBanner; matches: (r: TimesheetBannerRow) => boolean } {
  const n = (c: TimesheetChip) => rows.filter((r) => timesheetChipMatch(r, c)).length;
  const waiting = n("waiting");
  const missingOut = n("missing_out");
  const clockedIn = isCurrent ? n("clocked_in") : 0;
  const hours = hoursOf(sheets);
  const prevHours = prevSheets ? hoursOf(prevSheets) : null;
  const cost = periodLaborCost(sheets, otMultiplier);
  const period = isCurrent ? "this period" : "in this period";

  let insight: string;
  if (rows.length === 0) insight = "No crew yet — add employee logins to track time";
  else if (waiting || missingOut)
    insight = [waiting ? `${count(waiting, "timesheet")} waiting on you` : null, missingOut ? `${missingOut} missing a clock-out` : null, `${fmtHours(hours)} logged ${period}`]
      .filter(Boolean)
      .join(" · ");
  else insight = hours > 0 ? `${fmtHours(hours)} logged ${period} · nothing waiting on you` : `No hours logged ${period} yet`;

  const pick = (c: TimesheetChip) => setChip(chip === c ? null : c);
  const diff = prevHours == null ? null : r2(hours - prevHours);
  const rich: RichBanner = {
    insight,
    loading,
    listId: "timesheets-list",
    activeChip: chip,
    onChip: (k) => setChip(k as TimesheetChip | null),
    chips: [
      { key: "waiting", label: "waiting approval", count: waiting },
      { key: "missing_out", label: missingOut === 1 ? "missing a clock-out" : "missing clock-outs", count: missingOut },
      { key: "clocked_in", label: "clocked in now", count: clockedIn, hidden: true },
    ],
    tiles: [
      {
        key: "hours",
        label: "Hours this period",
        icon: Clock,
        value: rows.length ? fmtHours(hours) : "—",
        sub:
          diff == null || !rows.length
            ? rows.length
              ? "logged by your crew"
              : "Add a crew login to see this"
            : diff === 0
              ? "same as last period"
              : `${diff > 0 ? "+" : "−"}${fmtHours(Math.abs(diff))} vs last period`,
        onClick: () => setChip(null),
      },
      {
        key: "waiting",
        label: "Waiting approval",
        icon: CheckCheck,
        value: rows.length ? String(waiting) : "—",
        sub: waiting ? "submitted, not approved" : rows.length ? "Nothing waiting" : "Submitted timesheets show here",
        subTone: rows.length && !waiting ? "positive" : "muted",
        onClick: waiting ? () => pick("waiting") : undefined,
        active: chip === "waiting",
      },
      {
        key: "cost",
        label: "Labor cost this period",
        icon: DollarSign,
        value: rows.length && hours > 0 ? formatCurrency(cost.gross) : "—",
        sub: hours > 0 ? (cost.missingRate ? `some hours have no pay rate · ${compactMoney(cost.gross)} so far` : "gross pay, incl. overtime") : "Shows once hours are logged",
        subTone: cost.missingRate ? "negative" : "muted",
      },
      {
        key: "in",
        label: "Clocked in now",
        icon: Timer,
        value: rows.length && isCurrent ? String(clockedIn) : "—",
        sub: !isCurrent ? "Only for the current period" : clockedIn ? (clockedIn === 1 ? "timer running" : "timers running") : rows.length ? "Nobody on the clock" : "Running timers show here",
        onClick: clockedIn ? () => pick("clocked_in") : undefined,
        active: chip === "clocked_in",
      },
    ],
  };
  return { rich, matches: (r) => !chip || timesheetChipMatch(r, chip) };
}

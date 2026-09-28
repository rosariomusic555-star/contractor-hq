/* =============================================================================
 * Timesheets (0131) — flags, totals, payroll summary and exports.
 *
 * Hours, overtime and cost are worked out in ONE place, the database
 * (_recompute_workweek): net hours, daily + weekly overtime in time order,
 * the rate in effect that day, burden. This file only reads those stored
 * numbers (reg_hours / ot_hours / hourly_rate) — it never re-derives them —
 * plus the checks that gate "Submit week" and the export formats.
 * ========================================================================== */

export interface TimeEntryLike {
  id: string;
  project_id: string;
  project?: string | null;
  entry_date: string;
  start_at: string | null;
  end_at: string | null;
  break_minutes: number;
  hours: number;
  reg_hours: number | null;
  ot_hours: number | null;
  note: string | null;
}

/** A timesheet's entries (owner-side select) in the shape the checks take. */
export function timesheetEntries(t: {
  entries?: { id: string; project_id: string; project?: { name: string } | null; entry_date: string; start_at?: string | null; end_at?: string | null; break_minutes?: number; hours: number; reg_hours?: number | null; ot_hours?: number | null; note: string | null }[];
}): TimeEntryLike[] {
  return (t.entries ?? []).map((e) => ({
    id: e.id,
    project_id: e.project_id,
    project: e.project?.name ?? null,
    entry_date: e.entry_date,
    start_at: e.start_at ?? null,
    end_at: e.end_at ?? null,
    break_minutes: e.break_minutes ?? 0,
    hours: Number(e.hours ?? 0),
    reg_hours: e.reg_hours ?? null,
    ot_hours: e.ot_hours ?? null,
    note: e.note,
  }));
}

export type FlagKind = "running" | "missing_out" | "overlap" | "long_day" | "rain";

export interface TimesheetFlag {
  key: string;
  kind: FlagKind;
  date: string;
  entryIds: string[];
  message: string;
  /** Must be fixed (can't be explained away): a timer still running / no clock-out. */
  blocking: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

export function periodDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 31; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** "7.5" / "8" — hours as payroll shows them. */
export const fmtHours = (h: number | null | undefined) => {
  const v = r2(Number(h ?? 0));
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
};

export const fmtClock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

/** "07:30" for a time input. */
export const toTimeInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Local date + "HH:mm" → ISO. An end at/before the start rolls to the next day (overnight). */
export function toIso(date: string, time: string, after?: string): string {
  const d = new Date(`${date}T${time}`);
  if (after && d.getTime() <= Date.parse(after)) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** "2:07:15" for a running timer. */
export function elapsed(startIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(startIso)) / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Hours between two clock times minus a break — for the entry form's live preview
 * (the saved number comes from the server, with rounding / auto lunch applied). */
export function previewHours(startIso: string | null, endIso: string | null, breakMinutes: number): number | null {
  if (!startIso || !endIso) return null;
  const mins = (Date.parse(endIso) - Date.parse(startIso)) / 60000 - (breakMinutes || 0);
  return mins > 0 ? r2(mins / 60) : null;
}

/** Longest believable single entry — a longer one is almost always a typo'd
 * start / end (or a forgotten clock-out). */
export const MAX_ENTRY_HOURS = 16;

/** What's wrong with a time entry's start / end / break, and whether it runs
 * past midnight (allowed, but said out loud). No end yet = still open, fine. */
export function entryProblem(
  startIso: string | null,
  endIso: string | null,
  breakMinutes: number,
): { error: string | null; overnight: boolean } {
  if (!startIso || !endIso) return { error: null, overnight: false };
  const span = (Date.parse(endIso) - Date.parse(startIso)) / 60000;
  const overnight = new Date(endIso).toDateString() !== new Date(startIso).toDateString();
  if (span >= 24 * 60) return { error: "Start and end are the same time.", overnight };
  if (span > MAX_ENTRY_HOURS * 60) return { error: `That's over ${MAX_ENTRY_HOURS} hours — check the start and end times.`, overnight };
  if ((breakMinutes || 0) >= span) return { error: "The break is as long as the whole shift.", overnight };
  return { error: null, overnight };
}

export function dayTotals(entries: TimeEntryLike[]): Map<string, { hours: number; ot: number }> {
  const m = new Map<string, { hours: number; ot: number }>();
  for (const e of entries) {
    const t = m.get(e.entry_date) ?? { hours: 0, ot: 0 };
    t.hours = r2(t.hours + Number(e.hours ?? 0));
    t.ot = r2(t.ot + Number(e.ot_hours ?? 0));
    m.set(e.entry_date, t);
  }
  return m;
}

export function periodTotals(entries: TimeEntryLike[]): { total: number; reg: number; ot: number } {
  let reg = 0;
  let ot = 0;
  let total = 0;
  for (const e of entries) {
    total += Number(e.hours ?? 0);
    reg += Number(e.reg_hours ?? e.hours ?? 0);
    ot += Number(e.ot_hours ?? 0);
  }
  return { total: r2(total), reg: r2(reg), ot: r2(ot) };
}

/**
 * The checks that gate "Submit week": a timer still running (today) or a
 * missing clock-out (an earlier day) must be fixed; overlapping entries, a
 * very long day, and time on a rained-out day can be explained with a note.
 */
export function timesheetFlags(
  entries: TimeEntryLike[],
  opts: { today: string; longDayHours: number; rainDays: { project_id: string; date: string }[] },
): TimesheetFlag[] {
  const flags: TimesheetFlag[] = [];
  for (const e of entries) {
    if (e.start_at && !e.end_at) {
      const running = e.entry_date >= opts.today;
      flags.push({
        key: `${running ? "running" : "missing_out"}:${e.id}`,
        kind: running ? "running" : "missing_out",
        date: e.entry_date,
        entryIds: [e.id],
        message: running ? "Timer still running — clock out first" : "Missing clock-out — add the end time",
        blocking: true,
      });
    }
  }
  // Overlaps: timed entries on the same day whose times cross.
  const timed = entries.filter((e) => e.start_at && e.end_at).sort((a, b) => Date.parse(a.start_at!) - Date.parse(b.start_at!));
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (Date.parse(timed[j].start_at!) >= Date.parse(timed[i].end_at!)) break;
      const [a, b] = [timed[i].id, timed[j].id].sort();
      flags.push({ key: `overlap:${a}:${b}`, kind: "overlap", date: timed[i].entry_date, entryIds: [a, b], message: "Two entries overlap", blocking: false });
    }
  }
  for (const [date, t] of dayTotals(entries)) {
    if (t.hours > opts.longDayHours) {
      flags.push({
        key: `long_day:${date}`,
        kind: "long_day",
        date,
        entryIds: entries.filter((e) => e.entry_date === date).map((e) => e.id),
        message: `Long day — ${fmtHours(t.hours)} hours`,
        blocking: false,
      });
    }
  }
  const rain = new Set(opts.rainDays.map((r) => `${r.project_id}|${r.date}`));
  for (const e of entries) {
    if (rain.has(`${e.project_id}|${e.entry_date}`)) {
      flags.push({ key: `rain:${e.id}`, kind: "rain", date: e.entry_date, entryIds: [e.id], message: `Time logged on a rain-delay day${e.project ? ` (${e.project})` : ""}`, blocking: false });
    }
  }
  return flags.sort((a, b) => a.date.localeCompare(b.date) || Number(b.blocking) - Number(a.blocking));
}

/** Submit is allowed once nothing blocking is left and every other flag has a note. */
export function canSubmit(flags: TimesheetFlag[], notes: Record<string, string>): { ok: boolean; reason: string | null } {
  if (flags.some((f) => f.blocking)) return { ok: false, reason: "Fix the entries marked in red first." };
  const missing = flags.filter((f) => !notes[f.key]?.trim());
  if (missing.length) return { ok: false, reason: `Explain ${missing.length === 1 ? "the flagged item" : `the ${missing.length} flagged items`} or fix ${missing.length === 1 ? "it" : "them"}.` };
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Payroll (owner) — estimated gross: no taxes, no deductions.
// ---------------------------------------------------------------------------

export interface PayrollEntry {
  entry_date: string;
  hours: number;
  reg_hours: number | null;
  ot_hours: number | null;
  hourly_rate: number | null;
}

export interface PayrollRow {
  employeeId: string;
  name: string;
  reg: number;
  ot: number;
  /** Distinct rates used in the period (a raise mid-period shows both). */
  rates: number[];
  gross: number;
  missingRate: boolean;
}

export function payrollRow(employeeId: string, name: string, entries: PayrollEntry[], otMultiplier: number): PayrollRow {
  let reg = 0;
  let ot = 0;
  let gross = 0;
  let missingRate = false;
  const rates = new Set<number>();
  for (const e of entries) {
    const rh = Number(e.reg_hours ?? e.hours ?? 0);
    const oh = Number(e.ot_hours ?? 0);
    reg += rh;
    ot += oh;
    if (e.hourly_rate == null) {
      if (rh + oh > 0) missingRate = true;
      continue;
    }
    rates.add(Number(e.hourly_rate));
    gross += rh * Number(e.hourly_rate) + oh * Number(e.hourly_rate) * otMultiplier;
  }
  return { employeeId, name, reg: r2(reg), ot: r2(ot), rates: [...rates].sort((a, b) => a - b), gross: r2(gross), missingRate };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** Generic: employee, dates, regular hrs, OT hrs, rate, gross. */
export function genericPayrollCsv(rows: PayrollRow[], period: { start: string; end: string }): string {
  return csv([
    ["Employee", "Period start", "Period end", "Regular hours", "Overtime hours", "Hourly rate", "Estimated gross"],
    ...rows.map((r) => [r.name, period.start, period.end, r.reg.toFixed(2), r.ot.toFixed(2), r.rates.map((x) => x.toFixed(2)).join(" / "), r.gross.toFixed(2)]),
  ]);
}

/**
 * Gusto-style hours import — BEST GUESS at Gusto's column layout (the
 * user hasn't shared Gusto's template yet): one row per employee, first /
 * last name split, regular + overtime hours. Verify against Gusto's own
 * template before the first real payroll.
 */
export function gustoPayrollCsv(rows: PayrollRow[]): string {
  return csv([
    ["first_name", "last_name", "regular_hours", "overtime_hours"],
    ...rows.map((r) => {
      const parts = r.name.trim().split(/\s+/);
      const last = parts.length > 1 ? parts.pop()! : "";
      return [parts.join(" "), last, r.reg.toFixed(2), r.ot.toFixed(2)];
    }),
  ]);
}

export const TIMESHEET_STATUS: Record<string, { label: string; tone: string }> = {
  not_submitted: { label: "Not submitted", tone: "bg-muted text-muted-foreground" },
  submitted: { label: "Submitted", tone: "bg-info/10 text-info" },
  approved: { label: "Approved", tone: "bg-success/10 text-success" },
  rejected: { label: "Rejected", tone: "bg-destructive/10 text-destructive" },
};

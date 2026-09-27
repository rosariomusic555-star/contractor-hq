import { describe, expect, it } from "vitest";
import {
  PRECON_SETTINGS_DEFAULTS as S,
  autoCheck,
  locateCheck,
  locateDates,
  locateDelayWarning,
  locateExpiringSoon,
  openSummary,
  preconPhase,
  readiness,
  type PreconItemRow,
  type PreconSignals,
} from "./precon";

const ready: PreconSignals = {
  quoteApproved: true,
  hasSelections: true,
  selectionsOpen: 0,
  deposit: { due: 3000, paid: 3000 },
  materials: { tracked: 4, short: [] },
  deliveries: { unscheduled: [] },
  crewName: "Crew A",
  startConfirmed: true,
};

let n = 0;
const item = (kind: PreconItemRow["kind"], over: Partial<PreconItemRow> = {}): PreconItemRow => ({
  id: `i${++n}`,
  key: kind,
  label: kind,
  kind,
  required: true,
  sort_order: n,
  status: "open",
  override: false,
  note: null,
  details: {},
  done_at: null,
  removed: false,
  ...over,
});

describe("auto checks", () => {
  it("each signal", () => {
    expect(autoCheck("quote", { ...ready, quoteApproved: false }).state).toBe("open");
    expect(autoCheck("selections", { ...ready, hasSelections: false }).state).toBe("na");
    expect(autoCheck("selections", { ...ready, selectionsOpen: 2 })).toMatchObject({ state: "open", detail: "2 selections not approved" });
    expect(autoCheck("deposit", { ...ready, deposit: { due: 0, paid: 0 } }).state).toBe("na");
    expect(autoCheck("deposit", { ...ready, deposit: { due: 3000, paid: 1000 } })).toMatchObject({ state: "open", detail: "$1,000 of $3,000 received", action: "record_payment" });
    expect(autoCheck("materials", { ...ready, materials: { tracked: 3, short: ["Pavers"] } })).toMatchObject({ state: "open", detail: "1 line not fully ordered" });
    expect(autoCheck("materials", { ...ready, materials: { tracked: 0, short: [] } }).state).toBe("na");
    expect(autoCheck("deliveries", { ...ready, deliveries: { unscheduled: ["Base", "Sand"] } }).detail).toBe("2 lines with no delivery by the start date");
    expect(autoCheck("crew", { ...ready, crewName: null }).action).toBe("assign_crew");
    expect(autoCheck("start_confirmed", { ...ready, startConfirmed: false }).action).toBe("send_start_confirmation");
  });
});

describe("811", () => {
  // 2026-10-01 is a Thursday.
  it("clear-to-dig and expiry in working days (weekend submissions count from Monday)", () => {
    expect(locateDates("2026-10-01", S)).toEqual({ clearToDig: "2026-10-06", expires: "2026-10-22" });
    expect(locateDates("2026-10-03", S)).toEqual({ clearToDig: "2026-10-08", expires: "2026-10-26" });
    expect(locateDates(null, S)).toBeNull();
  });
  it("warns when the start is before clear-to-dig or the ticket runs out", () => {
    const early = locateCheck({ ticket: "A123", submitted: "2026-10-01" }, { start: "2026-10-05", end: "2026-10-09" }, S, "2026-10-01");
    expect(early.state).toBe("open");
    expect(early.warnings[0]).toMatch(/before clear to dig/);
    const long = locateCheck({ ticket: "A123", submitted: "2026-10-01" }, { start: "2026-10-12", end: "2026-10-30" }, S, "2026-10-01");
    expect(long.warnings[0]).toMatch(/refresh it/);
    const ok = locateCheck({ ticket: "A123", submitted: "2026-10-01" }, { start: "2026-10-12", end: "2026-10-16" }, S, "2026-10-01");
    expect(ok).toMatchObject({ state: "done", warnings: [], expires: "2026-10-22" });
    expect(locateCheck({}, { start: null, end: null }, S, "2026-10-01").detail).toBe("No 811 ticket yet");
  });
  it("rain delay + expiring soon", () => {
    expect(locateDelayWarning({ ticket: "A1", submitted: "2026-10-01" }, "2026-10-23", S)).toMatch(/expires Thu 10\/22/);
    expect(locateDelayWarning({ ticket: "A1", submitted: "2026-10-01" }, "2026-10-21", S)).toBeNull();
    expect(locateExpiringSoon("2026-10-22", "2026-10-30", "2026-10-19")).toBe(true);
    expect(locateExpiringSoon("2026-10-22", "2026-10-30", "2026-10-01")).toBe(false);
  });
});

describe("readiness", () => {
  const project = { start: "2026-10-12", end: "2026-10-16" };
  const items = () => [
    item("quote"),
    item("deposit"),
    item("locate", { details: { ticket: "A1", submitted: "2026-10-01" } }),
    item("hoa", { required: false }),
    item("custom", { label: "Dumpster ordered", status: "done" }),
    item("permit", { status: "na" }),
  ];

  it("ready when every required item is done or N/A", () => {
    const r = readiness(items(), ready, project, S, "2026-10-01");
    expect(r.status).toBe("ready");
    expect(r.openRequired).toEqual([]);
    expect([r.done, r.total]).toEqual([4, 5]); // HOA optional + open; permit N/A not counted
  });

  it("open → blocked inside the reminder window", () => {
    const sig = { ...ready, deposit: { due: 3000, paid: 0 } };
    expect(readiness(items(), sig, project, S, "2026-10-01").status).toBe("open");
    const r = readiness(items(), sig, project, S, "2026-10-07");
    expect(r.status).toBe("blocked");
    expect(r.daysToStart).toBe(5);
    expect(openSummary(r.openRequired)).toBe("Deposit still open");
  });

  it("manual override wins, and the auto result is kept", () => {
    const r = readiness([item("deposit", { override: true, status: "done", note: "Cash in hand" })], { ...ready, deposit: { due: 3000, paid: 0 } }, project, S, "2026-10-07");
    expect(r.status).toBe("ready");
    expect(r.views[0]).toMatchObject({ state: "done", autoState: "open", detail: "Marked by hand — Cash in hand" });
  });

  it("removed items drop out; summary wording", () => {
    const r = readiness([item("quote", { removed: true })], { ...ready, quoteApproved: false }, project, S, "2026-10-01");
    expect(r.views).toEqual([]);
    const two = readiness([item("locate"), item("deposit")], { ...ready, deposit: { due: 1, paid: 0 } }, project, S, "2026-10-01");
    expect(openSummary(two.openRequired)).toBe("811 ticket and deposit still open");
  });

  it("phase", () => {
    expect(preconPhase({ status: "scheduled", actual_start_date: null })).toBe("before");
    expect(preconPhase({ status: "in_progress", actual_start_date: "2026-10-12" })).toBe("started");
    expect(preconPhase({ status: "estimating", actual_start_date: null })).toBe("hidden");
  });
});

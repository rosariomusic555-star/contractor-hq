import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER_SETTINGS as S,
  appointmentWeather,
  assessDay,
  dayWeather,
  forecastWorkDays,
  formatInches,
  riskyWorkDays,
  scheduledWorkDays,
  shortDayLabel,
  worstRisk,
  type Forecast,
  type ForecastDay,
} from "./weatherRisk";

function day(date: string, over: Partial<ForecastDay> = {}, pops: Record<number, number> = {}): ForecastDay {
  const hourlyPop = new Array(24).fill(10);
  for (const [h, p] of Object.entries(pops)) hourlyPop[Number(h)] = p;
  return {
    date,
    condition: "partly_cloudy",
    highF: 72,
    lowF: 55,
    popMax: Math.max(...hourlyPop),
    rainIn: 0,
    thunder: false,
    snow: false,
    ice: false,
    hourlyPop,
    hourlyRainIn: new Array(24).fill(0),
    hourlyTempF: new Array(24).fill(65),
    ...over,
  };
}

const forecast = (days: ForecastDay[]): Forecast => ({ provider: "nws", timeZone: "America/New_York", fetchedAt: "", days });

describe("scheduledWorkDays", () => {
  // 2026-10-02 is a Friday.
  it("skips weekends inside the range but keeps start/end even on a weekend", () => {
    expect(scheduledWorkDays("2026-10-02", "2026-10-06", "2026-09-01", "2026-12-31")).toEqual(["2026-10-02", "2026-10-05", "2026-10-06"]);
    expect(scheduledWorkDays("2026-10-03", "2026-10-05", "2026-09-01", "2026-12-31")).toEqual(["2026-10-03", "2026-10-05"]);
  });
  it("treats no end date as a one-day job and clips to the window", () => {
    expect(scheduledWorkDays("2026-10-02", null, "2026-09-01", "2026-12-31")).toEqual(["2026-10-02"]);
    expect(scheduledWorkDays("2026-09-28", "2026-10-09", "2026-10-01", "2026-10-02")).toEqual(["2026-10-01", "2026-10-02"]);
    expect(scheduledWorkDays(null, null, "2026-10-01", "2026-10-09")).toEqual([]);
  });
});

describe("dayWeather", () => {
  it("scopes the rain chance to the work window", () => {
    const d = day("2026-10-02", {}, { 3: 90, 10: 40 });
    expect(dayWeather(d, S).pop).toBe(40);
    expect(dayWeather(d, { ...S, workStart: "02:00", workEnd: "05:00" }).pop).toBe(90);
  });
  it("falls back to the whole day when the window has no data left", () => {
    const d = day("2026-10-02", { popMax: 70, hourlyPop: new Array(24).fill(null) });
    expect(dayWeather(d, S).pop).toBe(70);
  });
});

describe("assessDay", () => {
  const w = (over: Partial<ForecastDay>, pops: Record<number, number> = {}) => dayWeather(day("2026-10-02", over, pops), S);

  it("is clear below both rain thresholds", () => {
    expect(assessDay(w({ rainIn: 0.1 }, { 12: 50 }), S)).toEqual({ level: "none", reasons: [], summary: "" });
  });
  it("flags amber on chance or amount, red on 80%+ or double the amount", () => {
    expect(assessDay(w({ rainIn: 0.1 }, { 12: 60 }), S).level).toBe("amber");
    expect(assessDay(w({ rainIn: 0.3 }, { 12: 20 }), S).level).toBe("amber");
    const red = assessDay(w({ rainIn: 0.6 }, { 12: 80 }), S);
    expect(red.level).toBe("red");
    expect(red.reasons[0]).toBe("80% chance of rain, ~0.6 in");
    expect(assessDay(w({ rainIn: 0.5 }, { 12: 20 }), S).level).toBe("red");
  });
  it("respects per-contractor thresholds", () => {
    const s = { ...S, rainPct: 40, rainIn: 1 };
    expect(assessDay(dayWeather(day("2026-10-02", { rainIn: 0.5 }, { 12: 45 }), s), s).level).toBe("amber");
  });
  it("thunder / snow / freezing / heat each follow their toggle", () => {
    expect(assessDay(w({ thunder: true }), S).reasons).toContain("Thunderstorms possible");
    expect(assessDay(w({ thunder: true }), { ...S, thunder: false }).level).toBe("none");
    expect(assessDay(w({ snow: true }), S).level).toBe("red");
    expect(assessDay(w({ lowF: 30 }), S).reasons).toEqual(["Freezing temps (low 30°F)"]);
    expect(assessDay(w({ lowF: 30 }), { ...S, freeze: false }).level).toBe("none");
    expect(assessDay(w({ highF: 96 }), S)).toMatchObject({ level: "amber", reasons: ["Extreme heat (high 96°F)"] });
    expect(assessDay(w({ highF: 104 }), S).level).toBe("red");
    expect(assessDay(w({ highF: 104 }), { ...S, heat: false }).level).toBe("none");
  });
  it("lists the worst reason first", () => {
    const r = assessDay(w({ thunder: true, highF: 96 }), S);
    expect(r.level).toBe("red");
    expect(r.reasons[0]).toBe("Thunderstorms possible");
  });
});

describe("forecastWorkDays / riskyWorkDays", () => {
  const f = forecast([
    day("2026-10-01"),
    day("2026-10-02", { rainIn: 0.6 }, { 12: 80 }),
    day("2026-10-03"),
    day("2026-10-05"),
  ]);
  it("only returns scheduled work days the forecast covers — nothing past its range", () => {
    const days = forecastWorkDays({ start: "2026-10-01", end: "2026-10-09" }, f, S, "2026-10-01");
    expect(days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-05"]);
  });
  it("starts from today", () => {
    expect(forecastWorkDays({ start: "2026-09-25", end: "2026-10-02" }, f, S, "2026-10-02").map((d) => d.date)).toEqual(["2026-10-02"]);
  });
  it("riskyWorkDays keeps only flagged days", () => {
    const r = riskyWorkDays({ start: "2026-10-01", end: "2026-10-09" }, f, S, "2026-10-01");
    expect(r.map((d) => [d.date, d.risk.level])).toEqual([["2026-10-02", "red"]]);
  });
  it("no forecast → nothing", () => {
    expect(forecastWorkDays({ start: "2026-10-01", end: null }, null, S, "2026-10-01")).toEqual([]);
  });
});

describe("appointmentWeather", () => {
  const f = forecast([day("2026-10-02", {}, { 8: 90, 14: 20 })]);
  it("uses the appointment's own hours when timed", () => {
    const r = appointmentWeather({ date_time: new Date(2026, 9, 2, 14, 0).toISOString(), all_day: false, duration_minutes: 60 }, f, S);
    expect(r?.weather.pop).toBe(20);
    expect(r?.risk.level).toBe("none");
  });
  it("uses the work window for an all-day visit", () => {
    const r = appointmentWeather({ date_time: new Date(2026, 9, 2, 12, 0).toISOString(), all_day: true }, f, S);
    expect(r?.weather.pop).toBe(90);
    expect(r?.risk.level).toBe("red");
  });
  it("outside the forecast range → null", () => {
    expect(appointmentWeather({ date_time: new Date(2026, 9, 9, 12).toISOString(), all_day: true }, f, S)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats inches and US day labels", () => {
    expect(formatInches(0.6)).toBe("0.6");
    expect(formatInches(0.25)).toBe("0.25");
    expect(formatInches(0.004)).toBe("<0.01");
    expect(shortDayLabel("2026-10-02")).toBe("Fri 10/2");
    expect(worstRisk(["none", "amber", "none"])).toBe("amber");
  });
});

import type { LaborEntry } from "./api";

/**
 * Structured job context (0114) — the comparable part of "site conditions".
 * All optional. Crew size is never asked: it comes from labor entries
 * (average distinct workers per day worked), else the planned crew.
 */

export type Slope = "flat" | "slight" | "moderate" | "steep";
export type Access = "easy" | "tight" | "difficult";
export type Soil = "normal" | "clay" | "rocky" | "wet";
export type Demo = "none" | "light" | "heavy";

export interface JobContext {
  slope?: Slope | null;
  access?: Access | null;
  soil?: Soil | null;
  demo?: Demo | null;
  crew_size?: number | null;
}

export const CONTEXT_FIELDS = [
  {
    key: "slope" as const,
    column: "job_slope" as const,
    label: "Slope",
    options: [
      { value: "flat", label: "Flat" },
      { value: "slight", label: "Slight" },
      { value: "moderate", label: "Moderate" },
      { value: "steep", label: "Steep" },
    ],
  },
  {
    key: "access" as const,
    column: "job_access" as const,
    label: "Access",
    options: [
      { value: "easy", label: "Easy" },
      { value: "tight", label: "Tight", hint: "e.g. narrow gate" },
      { value: "difficult", label: "Difficult", hint: "no machine access" },
    ],
  },
  {
    key: "soil" as const,
    column: "job_soil" as const,
    label: "Soil / excavation",
    options: [
      { value: "normal", label: "Normal" },
      { value: "clay", label: "Clay" },
      { value: "rocky", label: "Rocky" },
      { value: "wet", label: "Wet" },
    ],
  },
  {
    key: "demo" as const,
    column: "job_demo" as const,
    label: "Demo / removal",
    options: [
      { value: "none", label: "None" },
      { value: "light", label: "Light" },
      { value: "heavy", label: "Heavy" },
    ],
  },
];

export type ContextKey = (typeof CONTEXT_FIELDS)[number]["key"];

export const SLOPE_ORDER: Slope[] = ["flat", "slight", "moderate", "steep"];

export const contextValueLabel = (key: ContextKey, value: string | null | undefined) =>
  CONTEXT_FIELDS.find((f) => f.key === key)?.options.find((o) => o.value === value)?.label ?? null;

/** "moderate slope, tight access, clay soil" — only what's set. */
export function contextPhrase(c: Partial<JobContext>, keys: ContextKey[] = ["slope", "access", "soil", "demo"]): string {
  const parts: string[] = [];
  for (const k of keys) {
    const v = c[k];
    if (!v) continue;
    const label = contextValueLabel(k, v)?.toLowerCase();
    parts.push(k === "slope" ? `${label} slope` : k === "access" ? `${label} access` : k === "soil" ? `${label} soil` : `${label} demo`);
  }
  return parts.join(", ");
}

export function projectContext(p: { job_slope?: string | null; job_access?: string | null; job_soil?: string | null; job_demo?: string | null }): JobContext {
  return {
    slope: (p.job_slope as Slope) ?? null,
    access: (p.job_access as Access) ?? null,
    soil: (p.job_soil as Soil) ?? null,
    demo: (p.job_demo as Demo) ?? null,
  };
}

/** Average distinct workers per day worked, rounded to a half. Null with
 * no labor logged. */
export function crewSizeFromLabor(entries: Pick<LaborEntry, "entry_date" | "worker_name" | "employee_id" | "hours">[]): number | null {
  const byDay = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!(Number(e.hours) > 0)) continue;
    const who = e.employee_id ?? e.worker_name?.trim().toLowerCase() ?? "";
    const set = byDay.get(e.entry_date) ?? new Set<string>();
    set.add(who || `anon-${set.size}`);
    byDay.set(e.entry_date, set);
  }
  if (byDay.size === 0) return null;
  const avg = [...byDay.values()].reduce((s, v) => s + v.size, 0) / byDay.size;
  return Math.round(avg * 2) / 2;
}

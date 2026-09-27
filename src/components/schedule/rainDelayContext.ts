import { createContext, useContext } from "react";
import { useAuth } from "@/lib/auth";
import type { DelayReason } from "@/lib/scheduleShift";

export interface RainDelayTarget {
  projectId: string;
  date: string;
  reason?: DelayReason;
}

export const RainDelayContext = createContext<((t: RainDelayTarget) => void) | null>(null);

/** Opens the delay sheet — null for employees (only the owner applies delays). */
export function useRainDelay(): ((t: RainDelayTarget) => void) | null {
  const open = useContext(RainDelayContext);
  const { role } = useAuth();
  return role === "owner" ? open : null;
}

/** Client heads-up (0121): which schedule updates the sheet works through. */
export type HeadsUpTarget = { ids: string[] } | { projectId: string };

export const HeadsUpContext = createContext<((t: HeadsUpTarget) => void) | null>(null);

/** Opens the heads-up sheet — null for employees. */
export function useHeadsUp(): ((t: HeadsUpTarget) => void) | null {
  const open = useContext(HeadsUpContext);
  const { role } = useAuth();
  return role === "owner" ? open : null;
}

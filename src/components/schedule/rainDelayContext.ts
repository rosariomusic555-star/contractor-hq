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

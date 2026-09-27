import type { ReadinessStatus } from "@/lib/precon";

export const READINESS_LABEL: Record<ReadinessStatus, string> = { ready: "Ready to start", open: "Items open", blocked: "Blocked" };
export const READINESS_TONE: Record<ReadinessStatus, string> = {
  ready: "bg-success/10 text-success",
  open: "bg-warning-strong/15 text-warning",
  blocked: "bg-destructive/10 text-destructive",
};

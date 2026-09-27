import type { RiskLevel } from "@/lib/weatherRisk";

/** Amber / red risk colours, shared by every forecast surface. */
export const RISK_TEXT: Record<RiskLevel, string> = {
  none: "text-muted-foreground",
  amber: "text-warning",
  red: "text-destructive",
};
export const RISK_TILE: Record<RiskLevel, string> = {
  none: "bg-muted/40",
  amber: "bg-warning-strong/15 ring-1 ring-inset ring-warning-strong/40",
  red: "bg-destructive/10 ring-1 ring-inset ring-destructive/30",
};

import { DashboardV2 } from "@/components/dashboard2/DashboardV2";

/**
 * /dashboard — the refreshed dashboard (dashboard2/*). The original one and
 * its "New dashboard" switch were removed once the new one was approved
 * (2026-09-28).
 */
export function DashboardView() {
  return <DashboardV2 />;
}

import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { EmployeeLayout } from "@/components/layout/EmployeeLayout";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AssistantProvider } from "@/components/assistant/AssistantProvider";
import { RainDelayProvider } from "@/components/schedule/RainDelayProvider";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runQuoteColdChecks, runReviewChecks } from "@/lib/api";
import { runWeatherRiskAlerts } from "@/lib/forecast";
import { runPreconChecks } from "@/components/precon/usePrecon";
import { runMaintenanceChecks } from "@/components/maintenance/useMaintenance";

export function AppLayout() {
  const { session, loading, role } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();

  // "Going cold" automations (0117): once per app session for the owner —
  // idempotent server-side (one task per quote per rule, ever).
  useEffect(() => {
    if (!session || role !== "owner") return;
    try {
      if (sessionStorage.getItem("cold-checks-ran")) return;
      sessionStorage.setItem("cold-checks-ran", "1");
    } catch {
      // no storage — still fine to run
    }
    void runQuoteColdChecks();
    // Review requests (0122): mark finished jobs ready to ask (+ notify).
    void runReviewChecks().then((n) => {
      if (n > 0) {
        qc.invalidateQueries({ queryKey: ["review-requests"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    });
  }, [session, role, qc]);

  // Forecast on the schedule (0119) — morning weather-risk alerts, once per
  // local day on the first app open (deduped per job/day/level server-side
  // by the notifications unique key).
  useEffect(() => {
    if (!session || role !== "owner") return;
    const key = `weather-alerts-ran:${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // no storage — still fine to run
    }
    // Pre-construction reminders (0124) — same once-a-day slot.
    void runPreconChecks().then((n) => {
      if (n > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    // Maintenance reminders (0127) — reschedule finished ones, then due-soon reminders.
    void runMaintenanceChecks().then((n) => {
      qc.invalidateQueries({ queryKey: ["maintenance-items"] });
      if (n > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    void runWeatherRiskAlerts().then((n) => {
      if (n > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [session, role, qc]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  // Logged-out users get the auth screen at whatever URL they're on; after
  // signing in the session flips and they stay on that URL.
  if (!session) {
    return <AuthScreen />;
  }

  const onEmployeeRoute = location.pathname.startsWith("/employee");

  // Belt-and-suspenders on top of RLS (the actual enforcement, see
  // migration 0043) — an employee never even sees an owner route rendered,
  // and vice versa, regardless of what URL either types in directly.
  if (role === "employee" && !onEmployeeRoute) return <Navigate to="/employee" replace />;
  if (role === "owner" && onEmployeeRoute) return <Navigate to="/dashboard" replace />;

  if (role === "employee") {
    return <EmployeeLayout />;
  }

  return (
    <AssistantProvider>
      <RainDelayProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <BottomTabBar />
        <main className="p-4 pb-24 md:ml-[276px] md:p-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
        <AssistantButton />
        <AssistantPanel />
      </div>
      </RainDelayProvider>
    </AssistantProvider>
  );
}

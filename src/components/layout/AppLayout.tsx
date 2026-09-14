import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { EmployeeLayout } from "@/components/layout/EmployeeLayout";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AssistantProvider } from "@/components/assistant/AssistantProvider";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useAuth } from "@/lib/auth";

export function AppLayout() {
  const { session, loading, role } = useAuth();
  const location = useLocation();

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
      <div className="min-h-screen bg-background">
        <Sidebar />
        <BottomTabBar />
        <main className="p-4 pb-24 md:ml-64 md:p-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
        <AssistantButton />
        <AssistantPanel />
      </div>
    </AssistantProvider>
  );
}

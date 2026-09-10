import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AssistantProvider } from "@/components/assistant/AssistantProvider";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useAuth } from "@/lib/auth";

export function AppLayout() {
  const { session, loading } = useAuth();

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

import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useAuth } from "@/lib/auth";

export function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  // Logged-out users get the auth screen at whatever URL they're on; after
  // signing in the session flips and they stay on that URL.
  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileNav />
      <Sidebar />
      <main className="pt-16 md:pt-0 md:ml-64 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

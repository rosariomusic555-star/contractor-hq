import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { DashboardView } from "@/components/views/DashboardView";
import { QuotesView } from "@/components/views/QuotesView";
import { InvoicesView } from "@/components/views/InvoicesView";
import { RevenueView } from "@/components/views/RevenueView";
import { ClientsView } from "@/components/views/ClientsView";
import { SettingsView } from "@/components/views/SettingsView";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderView = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardView onNavigate={setActiveTab} />;
      case "quotes":
        return <QuotesView />;
      case "invoices":
        return <InvoicesView />;
      case "revenue":
        return <RevenueView />;
      case "clients":
        return <ClientsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={setActiveTab} />;
    }
  };

  // Dashboard uses its own full-screen layout, other views use the sidebar layout
  if (activeTab === "dashboard") {
    return (
      <div className="min-h-screen bg-background">
        <div className="md:hidden">
          <DashboardView onNavigate={setActiveTab} />
        </div>
        <div className="hidden md:block">
          <MobileNav activeTab={activeTab} onTabChange={setActiveTab} />
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="md:ml-64 p-4 md:p-8">
            <DashboardView onNavigate={setActiveTab} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileNav activeTab={activeTab} onTabChange={setActiveTab} />
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="pt-16 md:pt-0 md:ml-64 p-4 md:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default Index;

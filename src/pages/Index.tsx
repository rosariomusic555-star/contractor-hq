import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="ml-64 p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default Index;

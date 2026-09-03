import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardView } from "@/components/views/DashboardView";
import { ProjectsView } from "@/components/views/ProjectsView";
import { ProjectDetailView } from "@/components/views/ProjectDetailView";
import { ProjectSubPage } from "@/components/views/ProjectSubPage";
import { QuotesView } from "@/components/views/QuotesView";
import { InvoicesView } from "@/components/views/InvoicesView";
import { RevenueView } from "@/components/views/RevenueView";
import { ClientsView } from "@/components/views/ClientsView";
import { SettingsView } from "@/components/views/SettingsView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/projects" element={<ProjectsView />} />
              <Route path="/projects/:id" element={<ProjectDetailView />} />
              <Route
                path="/projects/:id/materials"
                element={<ProjectSubPage title="Materials sheet" />}
              />
              <Route path="/projects/:id/quote" element={<ProjectSubPage title="Quote" />} />
              <Route
                path="/projects/:id/invoices"
                element={<ProjectSubPage title="Invoices" />}
              />
              <Route path="/quotes" element={<QuotesView />} />
              <Route path="/invoices" element={<InvoicesView />} />
              <Route path="/revenue" element={<RevenueView />} />
              <Route path="/clients" element={<ClientsView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

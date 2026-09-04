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
import { ProjectMaterialsView } from "@/components/views/ProjectMaterialsView";
import { ProjectQuoteView } from "@/components/views/ProjectQuoteView";
import { ProjectInvoicesView } from "@/components/views/ProjectInvoicesView";
import { ProjectInvoiceDetailView } from "@/components/views/ProjectInvoiceDetailView";
import { QuotesView } from "@/components/views/QuotesView";
import { InvoicesView } from "@/components/views/InvoicesView";
import { RevenueView } from "@/components/views/RevenueView";
import { ClientsView } from "@/components/views/ClientsView";
import { SettingsView } from "@/components/views/SettingsView";
import SharedQuotePage from "./pages/SharedQuote";
import SharedInvoicePage from "./pages/SharedInvoice";
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
            {/* Public, unauthenticated — no AppLayout / sidebar / auth gate */}
            <Route path="/quote/:token" element={<SharedQuotePage />} />
            <Route path="/invoice/:token" element={<SharedInvoicePage />} />

            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/projects" element={<ProjectsView />} />
              <Route path="/projects/:id" element={<ProjectDetailView />} />
              <Route path="/projects/:id/materials" element={<ProjectMaterialsView />} />
              <Route path="/projects/:id/quote" element={<ProjectQuoteView />} />
              <Route path="/projects/:id/invoices" element={<ProjectInvoicesView />} />
              <Route
                path="/projects/:id/invoices/:invoiceId"
                element={<ProjectInvoiceDetailView />}
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

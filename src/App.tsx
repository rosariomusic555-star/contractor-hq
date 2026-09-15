import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { DashboardView } from "@/components/views/DashboardView";
import { ProjectsView } from "@/components/views/ProjectsView";
import { NewProjectView } from "@/components/views/NewProjectView";
import { ProjectDetailView } from "@/components/views/ProjectDetailView";
import { ProjectMaterialsView, ProjectMaterialsSheetDetailView } from "@/components/views/ProjectMaterialsView";
import { ProjectQuotesView } from "@/components/views/ProjectQuotesView";
import { ProjectQuoteDetailView } from "@/components/views/ProjectQuoteDetailView";
import { ProjectInvoicesView } from "@/components/views/ProjectInvoicesView";
import { ProjectInvoiceDetailView } from "@/components/views/ProjectInvoiceDetailView";
import { ProjectExpensesView } from "@/components/views/ProjectExpensesView";
import { ProjectChangeOrdersView } from "@/components/views/ProjectChangeOrdersView";
import { QuotesView } from "@/components/views/QuotesView";
import { QuoteDetailView } from "@/components/views/QuoteDetailView";
import { InvoicesView } from "@/components/views/InvoicesView";
import { InvoiceDetailView } from "@/components/views/InvoiceDetailView";
import { RevenueView } from "@/components/views/RevenueView";
import { ClientsView } from "@/components/views/ClientsView";
import { ClientDetailView } from "@/components/views/ClientDetailView";
import { PipelineView } from "@/components/views/PipelineView";
import { OpportunityDetailView } from "@/components/views/OpportunityDetailView";
import { TasksView } from "@/components/views/TasksView";
import { ClientFormView } from "@/components/views/ClientFormView";
import { SettingsView } from "@/components/views/SettingsView";
import { SettingsBusinessProfileView } from "@/components/views/SettingsBusinessProfileView";
import { SettingsQuoteDefaultsView } from "@/components/views/SettingsQuoteDefaultsView";
import { SettingsCategoriesView } from "@/components/views/SettingsCategoriesView";
import { SettingsExpenseCategoriesView } from "@/components/views/SettingsExpenseCategoriesView";
import { SettingsInvoicingView } from "@/components/views/SettingsInvoicingView";
import { SettingsPricebookView } from "@/components/views/SettingsPricebookView";
import { SettingsSmartSectionsView } from "@/components/views/SettingsSmartSectionsView";
import { SettingsQuickQuoteRatesView } from "@/components/views/SettingsQuickQuoteRatesView";
import { SettingsTeamView } from "@/components/views/SettingsTeamView";
import { SettingsEmployeesView } from "@/components/views/SettingsEmployeesView";
import { SettingsNotificationsView } from "@/components/views/SettingsNotificationsView";
import { SettingsBillingView } from "@/components/views/SettingsBillingView";
import { EmployeeProjectsView } from "@/components/views/EmployeeProjectsView";
import { EmployeeProjectDetailView } from "@/components/views/EmployeeProjectDetailView";
import { EmployeeAccountView } from "@/components/views/EmployeeAccountView";
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
          <ScrollToTop />
          <Routes>
            {/* Public, unauthenticated — no AppLayout / sidebar / auth gate */}
            <Route path="/quote/:token" element={<SharedQuotePage />} />
            <Route path="/invoice/:token" element={<SharedInvoicePage />} />

            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/projects" element={<ProjectsView />} />
              <Route path="/projects/new" element={<NewProjectView />} />
              <Route path="/projects/:id" element={<ProjectDetailView />} />
              <Route path="/projects/:id/materials" element={<ProjectMaterialsView />} />
              <Route
                path="/projects/:id/materials/:sheetId"
                element={<ProjectMaterialsSheetDetailView />}
              />
              <Route path="/projects/:id/quotes" element={<ProjectQuotesView />} />
              <Route path="/projects/:id/quotes/:quoteId" element={<ProjectQuoteDetailView />} />
              <Route path="/projects/:id/invoices" element={<ProjectInvoicesView />} />
              <Route
                path="/projects/:id/invoices/:invoiceId"
                element={<ProjectInvoiceDetailView />}
              />
              <Route path="/projects/:id/expenses" element={<ProjectExpensesView />} />
              <Route path="/projects/:id/change-orders" element={<ProjectChangeOrdersView />} />
              <Route path="/quotes" element={<QuotesView />} />
              <Route path="/quotes/:quoteId" element={<QuoteDetailView />} />
              <Route path="/invoices" element={<InvoicesView />} />
              <Route path="/invoices/:invoiceId" element={<InvoiceDetailView />} />
              <Route path="/revenue" element={<RevenueView />} />
              <Route path="/clients" element={<ClientsView />} />
              <Route path="/clients/new" element={<ClientFormView />} />
              <Route path="/clients/:clientId" element={<ClientDetailView />} />
              <Route path="/clients/:clientId/edit" element={<ClientFormView />} />
              <Route path="/pipeline" element={<PipelineView />} />
              <Route path="/pipeline/:id" element={<OpportunityDetailView />} />
              <Route path="/tasks" element={<TasksView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/settings/business-profile" element={<SettingsBusinessProfileView />} />
              <Route path="/settings/quote-defaults" element={<SettingsQuoteDefaultsView />} />
              <Route path="/settings/categories" element={<SettingsCategoriesView />} />
              <Route
                path="/settings/expense-categories"
                element={<SettingsExpenseCategoriesView />}
              />
              <Route path="/settings/invoicing" element={<SettingsInvoicingView />} />
              <Route path="/settings/pricebook" element={<SettingsPricebookView />} />
              <Route path="/settings/smart-sections" element={<SettingsSmartSectionsView />} />
              <Route path="/settings/quick-quote-rates" element={<SettingsQuickQuoteRatesView />} />
              <Route path="/settings/team" element={<SettingsTeamView />} />
              <Route path="/settings/employees" element={<SettingsEmployeesView />} />
              <Route path="/settings/notifications" element={<SettingsNotificationsView />} />
              <Route path="/settings/billing" element={<SettingsBillingView />} />

              {/* Employee-only mode (0043) — a completely separate, restricted
                  shell; AppLayout renders EmployeeLayout instead of Sidebar/
                  BottomTabBar for these when role === "employee". */}
              <Route path="/employee" element={<EmployeeProjectsView />} />
              <Route path="/employee/projects/:id" element={<EmployeeProjectDetailView />} />
              <Route path="/employee/account" element={<EmployeeAccountView />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

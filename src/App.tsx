import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useLocation,
  useParams,
} from "react-router-dom";
import { UnsavedChangesProvider } from "@/components/common/UnsavedChangesProvider";
import { AuthProvider } from "@/lib/auth";
import { PortalAuthProvider } from "@/lib/portalAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalHome } from "@/components/portal/PortalHome";
import { PortalProjectOverview } from "@/components/portal/PortalProjectOverview";
import { PortalDocumentView } from "@/components/portal/PortalDocumentView";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { DashboardView } from "@/components/views/DashboardView";
import { NeedsYouView } from "@/components/views/NeedsYouView";
import { BookingsView } from "@/components/views/BookingsView";
import { ProjectsView } from "@/components/views/ProjectsView";
import { NewProjectView } from "@/components/views/NewProjectView";
import { ProjectDetailView } from "@/components/views/ProjectDetailView";
import { ProjectMaterialsView, ProjectMaterialsSheetDetailView } from "@/components/views/ProjectMaterialsView";
import { ProjectLaborView } from "@/components/views/ProjectLaborView";
import { ProjectQuotesView } from "@/components/views/ProjectQuotesView";
import { ProjectQuoteDetailView } from "@/components/views/ProjectQuoteDetailView";
import { ProjectInvoicesView } from "@/components/views/ProjectInvoicesView";
import { ProjectInvoiceDetailView } from "@/components/views/ProjectInvoiceDetailView";
import { ProjectExpensesView } from "@/components/views/ProjectExpensesView";
import { MaterialSheetsView } from "@/components/views/MaterialSheetsView";
import { ExpensesView } from "@/components/views/ExpensesView";
import { ProjectChangeOrdersView } from "@/components/views/ProjectChangeOrdersView";
import { ProjectChangeOrderDetailView } from "@/components/views/ProjectChangeOrderDetailView";
import { ProjectMaterialOrdersView } from "@/components/views/ProjectMaterialOrdersView";
import { QuotesView } from "@/components/views/QuotesView";
import { QuoteDetailView } from "@/components/views/QuoteDetailView";
import { InvoicesView } from "@/components/views/InvoicesView";
import { InvoiceDetailView } from "@/components/views/InvoiceDetailView";
import { RevenueView } from "@/components/views/RevenueView";
import { RevenueInvoicedView } from "@/components/views/RevenueInvoicedView";
import { RevenueCollectedView } from "@/components/views/RevenueCollectedView";
import { RevenueMarginView } from "@/components/views/RevenueMarginView";
import { RevenueJobsView } from "@/components/views/RevenueJobsView";
import { RevenueMonthlyView } from "@/components/views/RevenueMonthlyView";
import { RevenueCategoriesView } from "@/components/views/RevenueCategoriesView";
import { RevenueClientsView } from "@/components/views/RevenueClientsView";
import { ClientsView } from "@/components/views/ClientsView";
import { ClientDetailView } from "@/components/views/ClientDetailView";
import { PipelineView } from "@/components/views/PipelineView";
import { OpportunityDetailView } from "@/components/views/OpportunityDetailView";
import { TasksView } from "@/components/views/TasksView";
import { AppointmentsView } from "@/components/views/AppointmentsView";
import { CommunicationsView } from "@/components/views/CommunicationsView";
import { ClientFormView } from "@/components/views/ClientFormView";
import { SettingsView } from "@/components/views/SettingsView";
import { SettingsOverheadView } from "@/components/views/SettingsOverheadView";
import { SettingsBusinessProfileView } from "@/components/views/SettingsBusinessProfileView";
import { SettingsQuoteDefaultsView } from "@/components/views/SettingsQuoteDefaultsView";
import { SettingsCategoriesView } from "@/components/views/SettingsCategoriesView";
import { SettingsLeadSourcesView } from "@/components/views/SettingsLeadSourcesView";
import { SettingsExpenseCategoriesView } from "@/components/views/SettingsExpenseCategoriesView";
import { SettingsMaterialCategoriesView } from "@/components/views/SettingsMaterialCategoriesView";
import { SettingsSuppliersView } from "@/components/views/SettingsSuppliersView";
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
import SharedReceiptPage from "./pages/SharedReceipt";
import SharedChangeOrderPage from "./pages/SharedChangeOrder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** /backlog was renamed to /bookings — old saved links (including the
 * ?month= query param the Dashboard card's month thumbnails use) keep
 * working via this redirect rather than 404ing. */
function BacklogRedirect() {
  const location = useLocation();
  return <Navigate to={`/bookings${location.search}`} replace />;
}

/** /projects/:id/cost-plan (the removed hub) → the Cost plan builder. */
function CostPlanRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={`/projects/${id}/materials`} replace />;
}

/** Every route's shell: scroll-to-top on navigation, and the app-wide
 * unsaved-changes guard (needs a data router for useBlocker). */
function RootLayout() {
  return (
    <UnsavedChangesProvider>
      <ScrollToTop />
      <Outlet />
    </UnsavedChangesProvider>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      {/* Public, unauthenticated — no AppLayout / sidebar / auth gate */}
      <Route path="/quote/:token" element={<SharedQuotePage />} />
      <Route path="/change-order/:token" element={<SharedChangeOrderPage />} />
      <Route path="/invoice/:token" element={<SharedInvoicePage />} />
      <Route path="/receipt/:token" element={<SharedReceiptPage />} />

      {/* Client Hub (/portal) — its own auth entirely (PortalAuthProvider,
          backed by portalSupabase's separate session), never the
          contractor AuthProvider above. PortalLayout renders the sign-in
          screen in place when there's no portal session, same convention
          AppLayout uses for the contractor side. */}
      <Route
        path="/portal"
        element={
          <PortalAuthProvider>
            <PortalLayout />
          </PortalAuthProvider>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="projects/:id" element={<PortalProjectOverview />} />
        <Route path="projects/:projectId/documents/:kind/:id" element={<PortalDocumentView />} />
      </Route>

      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/needs-you" element={<NeedsYouView />} />
        <Route path="/bookings" element={<BookingsView />} />
        <Route path="/backlog" element={<BacklogRedirect />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/projects/new" element={<NewProjectView />} />
        <Route path="/projects/:id" element={<ProjectDetailView />} />
        {/* The old Cost Plan hub — the Cost plan is the builder now. */}
        <Route path="/projects/:id/cost-plan" element={<CostPlanRedirect />} />
        <Route path="/projects/:id/labor" element={<ProjectLaborView />} />
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
        <Route path="/projects/:id/change-orders/:coId" element={<ProjectChangeOrderDetailView />} />
        <Route path="/projects/:id/material-orders" element={<ProjectMaterialOrdersView />} />
        <Route path="/quotes" element={<QuotesView />} />
        <Route path="/quotes/:quoteId" element={<QuoteDetailView />} />
        <Route path="/invoices" element={<InvoicesView />} />
        <Route path="/invoices/:invoiceId" element={<InvoiceDetailView />} />
        <Route path="/materials" element={<MaterialSheetsView />} />
        <Route path="/expenses" element={<ExpensesView />} />
        <Route path="/revenue" element={<RevenueView />} />
        <Route path="/revenue/invoiced" element={<RevenueInvoicedView />} />
        <Route path="/revenue/collected" element={<RevenueCollectedView />} />
        <Route path="/revenue/margin" element={<RevenueMarginView />} />
        <Route path="/revenue/jobs" element={<RevenueJobsView />} />
        <Route path="/revenue/monthly" element={<RevenueMonthlyView />} />
        <Route path="/revenue/categories" element={<RevenueCategoriesView />} />
        <Route path="/revenue/clients" element={<RevenueClientsView />} />
        <Route path="/clients" element={<ClientsView />} />
        <Route path="/clients/new" element={<ClientFormView />} />
        <Route path="/clients/:clientId" element={<ClientDetailView />} />
        <Route path="/clients/:clientId/edit" element={<ClientFormView />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/pipeline/:id" element={<OpportunityDetailView />} />
        <Route path="/tasks" element={<TasksView />} />
        <Route path="/appointments" element={<AppointmentsView />} />
        <Route path="/communications" element={<CommunicationsView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/settings/business-profile" element={<SettingsBusinessProfileView />} />
        <Route path="/settings/overhead" element={<SettingsOverheadView />} />
        <Route path="/settings/quote-defaults" element={<SettingsQuoteDefaultsView />} />
        <Route path="/settings/categories" element={<SettingsCategoriesView />} />
        <Route path="/settings/lead-sources" element={<SettingsLeadSourcesView />} />
        <Route path="/settings/material-categories" element={<SettingsMaterialCategoriesView />} />
        <Route
          path="/settings/expense-categories"
          element={<SettingsExpenseCategoriesView />}
        />
        <Route path="/settings/suppliers" element={<SettingsSuppliersView />} />
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
    </Route>,
  ),
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

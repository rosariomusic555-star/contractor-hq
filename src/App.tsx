import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
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
import { PortalAuthConfirm } from "@/components/portal/PortalAuthConfirm";
import { PORTAL_CONFIRM_PATH } from "@/lib/portalLinks";
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
import { ClientsView } from "@/components/views/ClientsView";
import { ClientDetailView } from "@/components/views/ClientDetailView";
import { PipelineView } from "@/components/views/PipelineView";
import { OpportunitiesView } from "@/components/views/OpportunitiesView";
import { OpportunityDetailView } from "@/components/views/OpportunityDetailView";
import { TasksView } from "@/components/views/TasksView";
import { AppointmentsView } from "@/components/views/AppointmentsView";
import { CommunicationsView } from "@/components/views/CommunicationsView";
import { ClientFormView } from "@/components/views/ClientFormView";
import { SettingsView } from "@/components/views/SettingsView";
import { SettingsOverheadView } from "@/components/views/SettingsOverheadView";
import { SettingsBusinessProfileView } from "@/components/views/SettingsBusinessProfileView";
import { SettingsQuoteDefaultsView } from "@/components/views/SettingsQuoteDefaultsView";
import { SettingsProjectTypesView } from "@/components/views/SettingsProjectTypesView";
import { SettingsLeadSourcesView } from "@/components/views/SettingsLeadSourcesView";
import { SettingsExpenseCategoriesView } from "@/components/views/SettingsExpenseCategoriesView";
import { SettingsMaterialCategoriesView } from "@/components/views/SettingsMaterialCategoriesView";
import { SettingsSuppliersView } from "@/components/views/SettingsSuppliersView";
import { SettingsCostPlanTaxView } from "@/components/views/SettingsCostPlanTaxView";
import { RouteErrorPage } from "@/components/common/ErrorBoundary";
import { SettingsInvoicingView } from "@/components/views/SettingsInvoicingView";
import { SettingsPricebookView } from "@/components/views/SettingsPricebookView";
import { SettingsSmartSectionsView } from "@/components/views/SettingsSmartSectionsView";
import { SettingsQuickQuoteRatesView } from "@/components/views/SettingsQuickQuoteRatesView";
import { SettingsTeamView } from "@/components/views/SettingsTeamView";
import { SettingsEmployeesView } from "@/components/views/SettingsEmployeesView";
import { SettingsNotificationsView } from "@/components/views/SettingsNotificationsView";
import { SettingsWeatherView } from "@/components/views/SettingsWeatherView";
import { SettingsMessagesView } from "@/components/views/SettingsMessagesView";
import { SettingsReviewsView } from "@/components/views/SettingsReviewsView";
import { SettingsPreconView } from "@/components/views/SettingsPreconView";
import { SettingsProgressView } from "@/components/views/SettingsProgressView";
import { SettingsMaintenanceView } from "@/components/views/SettingsMaintenanceView";
import { SettingsPayrollView } from "@/components/views/SettingsPayrollView";
import { SettingsBusinessHealthView } from "@/components/views/SettingsBusinessHealthView";
import { BusinessHealthView } from "@/components/health/BusinessHealthView";
import { TimesheetsView } from "@/components/timesheets/TimesheetsView";
import { TimesheetDetailView } from "@/components/timesheets/TimesheetDetailView";
import { PayrollView } from "@/components/timesheets/PayrollView";
import { EmployeeTimeView } from "@/components/timesheets/EmployeeTimeView";
import { PortfolioView } from "@/components/views/PortfolioView";
import { EmployeeWorkOrderPage, WorkOrderPreviewPage } from "@/components/views/WorkOrderPage";
import { NotificationsView } from "@/components/views/NotificationsView";
import { SettingsBillingView } from "@/components/views/SettingsBillingView";
import { EmployeeProjectsView } from "@/components/views/EmployeeProjectsView";
import { EmployeeProjectDetailView } from "@/components/views/EmployeeProjectDetailView";
import { EmployeeAccountView } from "@/components/views/EmployeeAccountView";
import SharedQuotePage from "./pages/SharedQuote";
import ReviewRedirect from "./pages/ReviewRedirect";
import SharedInvoicePage from "./pages/SharedInvoice";
import SharedReceiptPage from "./pages/SharedReceipt";
import { ClientViewPage } from "@/components/views/ClientViewPage";
import { SettingsEstimatingInsightsView } from "@/components/views/SettingsEstimatingInsightsView";
import { SettingsSelectionTemplatesView } from "@/components/views/SettingsSelectionTemplatesView";
import SharedChangeOrderPage from "./pages/SharedChangeOrder";
import NotFound from "./pages/NotFound";

// Any successful change can move a job's pre-construction readiness (0124) —
// refresh those (cheap, cached per job) rather than wiring every mutation.
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({ onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["precon"] }) }),
});

/** /backlog was renamed to /bookings — old saved links (including the
 * ?month= query param the Dashboard card's month thumbnails use) keep
 * working via this redirect rather than 404ing. */
function BacklogRedirect() {
  const location = useLocation();
  return <Navigate to={`/bookings${location.search}`} replace />;
}

/** The classic Revenue detail pages (/revenue/invoiced, /collected, …)
 * were retired — old links land on the Revenue report, on the matching
 * basis where there is one. */
function RevenueDetailRedirect() {
  const { detail = "" } = useParams();
  const basis = detail === "invoiced" || detail === "collected" ? detail : null;
  return <Navigate to={basis ? `/revenue?basis=${basis}` : "/revenue"} replace />;
}

/** /projects/:id/cost-plan (the removed hub) → the Cost plan builder. */
function CostPlanRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={`/projects/${id}/materials`} replace />;
}

/** Every route's shell: scroll-to-top on navigation, and the app-wide
 * unsaved-changes guard (needs a data router for useBlocker). */
function RootLayout() {
  const location = useLocation();
  // A Client Hub sign-in link that landed outside /portal (Supabase falls
  // back to the Site URL when a redirect isn't allowed) — send it to the
  // Hub's confirm page instead of the contractor app.
  if (!location.pathname.startsWith("/portal") && new URLSearchParams(location.search).has("token_hash")) {
    return <Navigate to={`${PORTAL_CONFIRM_PATH}${location.search}`} replace />;
  }
  return (
    <UnsavedChangesProvider>
      <ScrollToTop />
      <Outlet />
    </UnsavedChangesProvider>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />} errorElement={<RouteErrorPage />}>
      {/* Public, unauthenticated — no AppLayout / sidebar / auth gate */}
      <Route path="/quote/:token" element={<SharedQuotePage />} />
      {/* Tracked review link (0122) — public, logs the click and redirects. */}
      <Route path="/r/:token" element={<ReviewRedirect />} />
      <Route path="/change-order/:token" element={<SharedChangeOrderPage />} />
      <Route path="/invoice/:token" element={<SharedInvoicePage />} />
      <Route path="/receipt/:token" element={<SharedReceiptPage />} />

      {/* Client Hub (/portal) — its own auth entirely (PortalAuthProvider,
          backed by portalSupabase's separate session), never the
          contractor AuthProvider above. PortalLayout renders the sign-in
          screen in place when there's no portal session, same convention
          AppLayout uses for the contractor side. */}
      {/* Where every Hub sign-in link lands — outside PortalLayout's sign-in
          gate so the link is handled before any "not signed in" screen. */}
      <Route
        path={PORTAL_CONFIRM_PATH}
        element={
          <PortalAuthProvider>
            <PortalAuthConfirm />
          </PortalAuthProvider>
        }
      />
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
        {/* A crashed page shows "Something went wrong" inside the shell —
            the sidebar and tab bar stay. */}
        <Route errorElement={<RouteErrorPage />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/needs-you" element={<NeedsYouView />} />
          <Route path="/bookings" element={<BookingsView />} />
          <Route path="/backlog" element={<BacklogRedirect />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/projects/new" element={<NewProjectView />} />
          <Route path="/projects/:id" element={<ProjectDetailView />} />
          <Route path="/projects/:id/client-view" element={<ClientViewPage />} />
          <Route path="/projects/:projectId/client-view/documents/:kind/:id" element={<PortalDocumentView mode="preview" />} />
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
          <Route path="/revenue/:detail" element={<RevenueDetailRedirect />} />
          <Route path="/clients" element={<ClientsView />} />
          <Route path="/clients/new" element={<ClientFormView />} />
          <Route path="/clients/:clientId" element={<ClientDetailView />} />
          <Route path="/clients/:clientId/edit" element={<ClientFormView />} />
          <Route path="/pipeline" element={<PipelineView />} />
          <Route path="/opportunities" element={<OpportunitiesView />} />
          <Route path="/pipeline/:id" element={<OpportunityDetailView />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/appointments" element={<AppointmentsView />} />
          <Route path="/communications" element={<CommunicationsView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/settings/business-profile" element={<SettingsBusinessProfileView />} />
          <Route path="/settings/overhead" element={<SettingsOverheadView />} />
          <Route path="/settings/estimating-insights" element={<SettingsEstimatingInsightsView />} />
          <Route path="/settings/selection-templates" element={<SettingsSelectionTemplatesView />} />
          <Route path="/settings/quote-defaults" element={<SettingsQuoteDefaultsView />} />
          <Route path="/settings/project-types" element={<SettingsProjectTypesView />} />
          {/* Categories and Project types were the same list — one page now. */}
          <Route path="/settings/categories" element={<Navigate to="/settings/project-types" replace />} />
          <Route path="/settings/lead-sources" element={<SettingsLeadSourcesView />} />
          <Route path="/settings/material-categories" element={<SettingsMaterialCategoriesView />} />
          <Route
            path="/settings/expense-categories"
            element={<SettingsExpenseCategoriesView />}
          />
          <Route path="/settings/suppliers" element={<SettingsSuppliersView />} />
          <Route path="/settings/cost-plan-tax" element={<SettingsCostPlanTaxView />} />
          <Route path="/settings/invoicing" element={<SettingsInvoicingView />} />
          <Route path="/settings/pricebook" element={<SettingsPricebookView />} />
          <Route path="/settings/smart-sections" element={<SettingsSmartSectionsView />} />
          <Route path="/settings/quick-quote-rates" element={<SettingsQuickQuoteRatesView />} />
          <Route path="/settings/team" element={<SettingsTeamView />} />
          <Route path="/settings/employees" element={<SettingsEmployeesView />} />
          <Route path="/settings/notifications" element={<SettingsNotificationsView />} />
          <Route path="/settings/weather" element={<SettingsWeatherView />} />
          <Route path="/settings/messages" element={<SettingsMessagesView />} />
          <Route path="/settings/reviews" element={<SettingsReviewsView />} />
          <Route path="/settings/precon" element={<SettingsPreconView />} />
          <Route path="/settings/progress" element={<SettingsProgressView />} />
          <Route path="/settings/maintenance" element={<SettingsMaintenanceView />} />
          <Route path="/settings/payroll" element={<SettingsPayrollView />} />
          <Route path="/settings/business-health" element={<SettingsBusinessHealthView />} />
          <Route path="/business-health" element={<BusinessHealthView />} />
          <Route path="/timesheets" element={<TimesheetsView />} />
          <Route path="/timesheets/payroll/:start" element={<PayrollView />} />
          <Route path="/timesheets/:id" element={<TimesheetDetailView />} />
          <Route path="/portfolio" element={<PortfolioView />} />
          {/* Crew work order (0125) — the owner's preview of the crew page. */}
          <Route path="/projects/:id/work-order" element={<WorkOrderPreviewPage />} />
          <Route path="/notifications" element={<NotificationsView />} />
          <Route path="/settings/billing" element={<SettingsBillingView />} />

          {/* Employee-only mode (0043) — a completely separate, restricted
              shell; AppLayout renders EmployeeLayout instead of Sidebar/
              BottomTabBar for these when role === "employee". */}
          <Route path="/employee" element={<EmployeeProjectsView />} />
          <Route path="/employee/projects/:id" element={<EmployeeProjectDetailView />} />
          <Route path="/employee/projects/:id/work-order" element={<EmployeeWorkOrderPage />} />
          <Route path="/employee/account" element={<EmployeeAccountView />} />
          <Route path="/employee/time" element={<EmployeeTimeView />} />
        </Route>
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

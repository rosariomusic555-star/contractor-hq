import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddNewWorkDialog } from "@/components/projects/AddNewWorkDialog";
import { MaterialAlertsBar } from "@/components/materials/MaterialAlertsBar";
import { markLinesOrdered } from "@/lib/materialAlertActions";
import { useParams, useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Link2,
  Loader2,
  Mail,
  Phone,
  MapPin,
  PartyPopper,
  Send,
  Trash2,
  X,
  Plus,
  Eye,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { PaymentsList } from "@/components/payments/PaymentsList";
import { ProjectSelectionsCard } from "@/components/selections/ProjectSelectionsCard";
import { PlannedVsActualCard } from "@/components/planned-actual/PlannedVsActualCard";
import { JobContextChips } from "@/components/planned-actual/JobContextChips";
import { CloseoutDialog } from "@/components/planned-actual/CloseoutPanel";
import { DownloadSummaryButton } from "@/components/client-hub/DownloadSummaryButton";
import { RecordPaymentSheet } from "@/components/payments/RecordPaymentSheet";
import { projectMoneySummary } from "@/lib/projectMoney";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { ProjectMeasurementsCard } from "@/components/common/ProjectMeasurementsCard";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { MeasuredCategoryMultiSelect } from "@/components/measurements/MeasuredCategoryMultiSelect";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { projectDurationStatus, scheduledWindowWorkingDays } from "@/lib/projectDuration";
import {
  getProject,
  listQuotes,
  listInvoices,
  listPayments,
  getClientViewProject,
  listMaterials,
  listMaterialsSheets,
  listExpenses,
  listExpenseCategories,
  listChangeOrders,
  listMaterialOrders,
  listProjectEvents,
  listCrews,
  quoteTotal,
  logProjectEvent,
  updateProject,
  pickHeadlineQuote,
  projectContractValue,
  approvedChangeOrderTotal,
  headlineDepositDue,
  isDepositOverdue,
  listProjectNotes,
  deleteProjectNote,
  updateClient,
  listProjectMessages,
  sendProjectMessage,
  getSignedImageUrls,
  setProjectFeatureTypes,
  projectCategoryIds,
  listUsageLogsForItems,
  getBusinessProfile,
  reconcileMaterialsItem,
  recordMaterialLearningSnapshot,
  getOpportunityByProjectId,
  listLaborEntries,
  getOverheadSettings,
  updateMaterialsItem,
  listProjectFeatures,
  listCategories,
  isPreSaleProject,
  createProjectInvoice,
  DEPOSIT_INVOICE_NOTE,
  type ProjectStatus,
  type MaterialsItem,
  type MaterialsSection,
  type MaterialsUsageLog,
} from "@/lib/api";
import { countsTowardTotals } from "@/lib/features";
import { featureReports, type FeatureReport } from "@/lib/featureFinancials";
import { FeatureProfitTable } from "@/components/projects/FeatureReport";
import { SetUpOverheadLink } from "@/components/overhead/TrueCostCard";
import {
  TRUE_COST_STATUS_CLASS,
  burdenPerHour,
  formatLabor,
  plannedManHours,
  trueCost,
  type OverheadSettings,
  type TrueCost,
} from "@/lib/overhead";
import { inviteClientToHub } from "@/lib/portalApi";
import { ALL_TIME_RANGE, invoicedTotal, collectedTotal, resolveCost, projectBillingBadge } from "@/lib/financials";
import {
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
  projectStatusMeta,
  projectBillingStatusMeta,
  opportunityStageMeta,
  quoteStatusMeta,
} from "@/lib/statusMeta";
import {
  sheetCostSummary,
  materialAlerts,
  startContext,
  needsReconciliation,
  leftoverQuantity,
  deliveredQuantity,
  usedQuantity,
  effectiveEstimate,
  isProjectActive,
  executionTrackedLines,
  currentBaseline,
  type DeliveryLineWithOrderStatus,
} from "@/lib/materialTracking";
import { LogUsageDialog } from "@/components/materials/LogUsageDialog";
import { UsageLogHistoryDialog } from "@/components/materials/UsageLogHistoryDialog";
import { actualCostByType, costPlanSummary } from "@/lib/costPlan";
import { COST_BUCKETS, COST_TYPE_GROUP_LABEL, sectionLaborHours, type CostTotals } from "@/lib/costPlanMath";
import { materialLineLabel } from "@/lib/materialsMath";
import { BackLink } from "@/components/common/BackLink";
import { ProjectForecastStrip } from "@/components/weather/ForecastStrip";
import { CrewSelect } from "@/components/schedule/CrewSelect";
import { ScheduleMenu } from "@/components/schedule/ScheduleMenu";
import { ScheduleDelaysList } from "@/components/schedule/ScheduleDelaysList";
import { HeadsUpReminder } from "@/components/schedule/HeadsUpReminder";
import { ProjectReviewCard } from "@/components/reviews/ProjectReviewCard";
import { PreconCard } from "@/components/precon/PreconCard";
import { CrewWorkOrderCard } from "@/components/workorder/CrewWorkOrderCard";
import { ProgressUpdatesCard } from "@/components/progress/ProgressUpdatesCard";
import { MaintenanceCard } from "@/components/maintenance/MaintenanceCard";
import type { PreconBundle } from "@/lib/preconSignals";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProjectDelays } from "@/components/schedule/useUndoScheduleDelay";
import { delayDays } from "@/lib/scheduleShift";

const expenseDate = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [estimateDraft, setEstimateDraft] = useState("");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  // "Add new work" — also opened from a change order's "new feature" hint
  // (?add-new-work=1).
  const [searchParams, setSearchParams] = useSearchParams();
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  // …#measure or #measure-<categoryId> (the add-on quote's "1 · Measure it"):
  // open the Measurements card at that type's card and pulse it.
  const location = useLocation();
  const [measureFocus, setMeasureFocus] = useState<{ n: number; categoryId: string | null }>({ n: 0, categoryId: null });
  useEffect(() => {
    const m = location.hash.match(/^#measure(?:-(.+))?$/);
    if (m) setMeasureFocus((f) => ({ n: f.n + 1, categoryId: m[1] ?? null }));
  }, [location.hash, location.key]);
  useEffect(() => {
    if (searchParams.get("add-new-work")) {
      setAddWorkOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [logUsageLine, setLogUsageLine] = useState<MaterialsItem | null>(null);
  const [historyLine, setHistoryLine] = useState<MaterialsItem | null>(null);

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: id }], queryFn: () => listQuotes(id) });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: id }], queryFn: () => listInvoices(id) });
  const { data: payments = [] } = useQuery({ queryKey: ["payments", { project: id }], queryFn: () => listPayments(id) });
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  // Pre-construction (0124): starting with required items open is a
  // warning ("Start anyway"), never a block.
  const [startGuard, setStartGuard] = useState<null | { apply: () => void; open: string[] }>(null);
  const guardStart = (apply: () => void) => {
    const b = qc.getQueryData<PreconBundle>(["precon", id]);
    const open = b?.readiness.openRequired.map((v) => v.item.label) ?? [];
    if (open.length) setStartGuard({ apply, open });
    else apply();
  };
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: id }], queryFn: () => listMaterials(id) });
  const { data: materialsSheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: id }],
    queryFn: () => listMaterialsSheets(id),
  });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: id }], queryFn: () => listExpenses(id) });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: id }],
    queryFn: () => listChangeOrders(id),
  });
  const { data: materialOrders = [] } = useQuery({
    queryKey: ["material-orders", { project: id }],
    queryFn: () => listMaterialOrders(id),
  });
  const { data: events = [] } = useQuery({ queryKey: ["project-events", id], queryFn: () => listProjectEvents(id) });
  // Rain delay action (0120) — delay history + weather days for the
  // Estimated duration card; crews for the Schedule card's picker.
  const { data: scheduleDelays = [] } = useProjectDelays(id);
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  // The Material Tracker shows on every project regardless of quote/CO
  // approval or project status — see effectiveEstimate()'s doc comment for
  // how "Estimated" stays a real number (live sheet values) before a real
  // baseline ever gets snapshotted at Won.
  // Tracking is about material lines only (the cost plan also has sub /
  // equipment / other lines).
  const trackedLines: MaterialsItem[] = materials
    .filter(countsTowardTotals)
    .flatMap((s) => s.materials_items)
    .filter((i) => (i.cost_type ?? "material") === "material");
  const trackedLineIds = trackedLines.map((l) => l.id);
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", trackedLineIds],
    queryFn: () => listUsageLogsForItems(trackedLineIds),
    enabled: trackedLineIds.length > 0,
  });
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const { data: linkedOpportunity } = useQuery({
    queryKey: ["opportunity-by-project", id],
    queryFn: () => getOpportunityByProjectId(id),
  });
  const { data: expenseCategories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: listExpenseCategories });
  const { data: projectFeatures = [] } = useQuery({ queryKey: ["project-features", id], queryFn: () => listProjectFeatures(id) });
  const { data: overheadSettings } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });
  const { data: jobCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: laborEntries = [] } = useQuery({
    queryKey: ["labor-entries", { project: id }],
    queryFn: () => listLaborEntries(id),
  });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(id, { status }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      // Marked Complete → offer the closeout snapshot (Feature 5).
      if (status === "complete" && project?.status !== "complete") setCloseoutOpen(true);
      void logProjectEvent(id, "status_changed", `Status → ${projectStatusMeta(status).label}`);
      qc.invalidateQueries({ queryKey: ["project-events", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update status", description: err.message, variant: "destructive" }),
  });

  const scheduleMutation = useMutation({
    mutationFn: (patch: { scheduled_start_date?: string | null; scheduled_end_date?: string | null; crew_id?: string | null }) =>
      updateProject(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
      qc.invalidateQueries({ queryKey: ["schedule-updates"] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update schedule", description: err.message, variant: "destructive" }),
  });

  // End can't be before start in either direction — changing Start past an
  // already-set End (not just changing End past Start) is blocked too,
  // same DB constraint this mirrors client-side (migration 0083).
  const setScheduledStart = (value: string) => {
    const start = value || null;
    if (start && project?.scheduled_end_date && project.scheduled_end_date < start) {
      toast({ title: "Start date must be on or before the end date", variant: "destructive" });
      return;
    }
    scheduleMutation.mutate({ scheduled_start_date: start });
  };
  const setScheduledEnd = (value: string) => {
    const end = value || null;
    if (end && project?.scheduled_start_date && end < project.scheduled_start_date) {
      toast({ title: "End date can't be before the start date", variant: "destructive" });
      return;
    }
    scheduleMutation.mutate({ scheduled_end_date: end });
  };

  const categoriesMutation = useMutation({
    mutationFn: (categoryIds: string[]) => setProjectFeatureTypes(id, categoryIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-features", id] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update project types", description: err.message, variant: "destructive" }),
  });

  const durationMutation = useMutation({
    mutationFn: async (patch: {
      estimated_duration_days?: number | null;
      actual_start_date?: string | null;
      actual_end_date?: string | null;
    }) => {
      await updateProject(id, patch);
      // Client-visible milestone (Client Hub activity feed) — only on the
      // real null → date transition, not every subsequent edit to the field.
      if (patch.actual_start_date && !project?.actual_start_date) {
        void logProjectEvent(id, "project_started", "Work started");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", id] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't update estimated duration", description: err.message, variant: "destructive" }),
  });

  const inviteToHubMut = useMutation({
    mutationFn: async () => {
      if (!project?.client?.email || !project.client_id) throw new Error("This client has no email on file.");
      await inviteClientToHub(project.client.email);
      await updateClient(project.client_id, { portal_invited_at: new Date().toISOString() });
    },
    onSuccess: () => toast({ title: "Invite sent" }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // The Won banner's "Send deposit invoice" when no deposit invoice exists
  // (never created, or deleted) — creates a pre-filled one and opens it.
  // Material alerts' quick actions: log the group as ordered in one tap,
  // or stop tracking a line that isn't needed / is already on hand.
  const markOrderedMut = useMutation({
    mutationFn: (lineIds: string[]) => markLinesOrdered(id, trackedLines.filter((l) => lineIds.includes(l.id))),
    onSuccess: (_o, lineIds) => {
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      toast({ title: `${pluralize(lineIds.length, "line")} marked ordered`, description: "Logged as one order — add the supplier and delivery date under Material orders." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const notNeededMut = useMutation({
    mutationFn: (lineId: string) => updateMaterialsItem(lineId, { tracked: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Won't alert for that line", description: "Tracking is off for it — turn it back on in the Cost plan." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const createDepositMut = useMutation({
    mutationFn: () => createProjectInvoice(id, "deposit"),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      navigate(`/projects/${id}/invoices/${invoice.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  const headlineQuote = pickHeadlineQuote(quotes);
  const contract = projectContractValue(quotes, changeOrders);
  const projectInvoicedTotal = invoicedTotal(invoices, ALL_TIME_RANGE);
  // Project money (0111) — one shared summary (src/lib/projectMoney.ts).
  const money = projectMoneySummary({ contractValue: contract, invoices, payments });
  const paidTotal = money.received;
  const depositOverdue = isDepositOverdue(headlineQuote, paidTotal);
  const depositRequired = headlineDepositDue(headlineQuote);
  const billing = projectBillingBadge(contract, projectInvoicedTotal, paidTotal, depositRequired);
  // "Won — project ready" CTAs, each shown only while it's still to do:
  // - Schedule: until the job has a start date (editable any time in the
  //   Schedule card).
  // - Deposit: by the deposit invoice's own status — a draft still needs
  //   sending; once sent/paid/overdue it's done. If it's deleted, the CTA
  //   comes back and creates a fresh, pre-filled one (createProjectInvoice).
  const depositInvoice = invoices.find((i) => i.notes === DEPOSIT_INVOICE_NOTE);
  const showScheduleCta = !project.scheduled_start_date;
  const depositCta: "open" | "create" | null = depositInvoice
    ? depositInvoice.status === "draft"
      ? "open"
      : null
    : headlineQuote?.status === "approved" && Number(headlineQuote.deposit_percentage) > 0
      ? "create"
      : null;
  const showWonBanner =
    (project.status === "scheduled" || project.status === "in_progress") && (showScheduleCta || depositCta !== null);

  // Material budget tracking (0080) — deliveries paired with their parent
  // order's status (see materialTracking.ts's DeliveryLineWithOrderStatus),
  // and the tracked-sheet cost summary that overrides the Profit Summary's
  // own cost figure once the project is Complete AND every tracked line is
  // reconciled (see materialActualCost's doc comment, financials.ts, for
  // why this deliberately isn't blended in any earlier).
  const deliveries: DeliveryLineWithOrderStatus[] = materialOrders.flatMap((o) =>
    o.material_order_items.map((item) => ({ item, orderStatus: o.status })),
  );
  // Always computed — sheetCostSummary/needsReconciliation both handle an
  // empty line list fine (all-zero totals), so the Materials card shows
  // on every project, not just ones with a sheet started yet.
  const materialCostSummary = sheetCostSummary(trackedLines, deliveries, usageLogs);
  const unreconciledLines = needsReconciliation(trackedLines, deliveries, usageLogs);
  const materialsFullyReconciled = trackedLines.length > 0 && unreconciledLines.length === 0;
  const materialAlertList = businessProfile
    ? materialAlerts(
        project,
        trackedLines,
        deliveries,
        usageLogs,
        {
          overOrderMarginPct: businessProfile.material_over_order_margin_pct,
          notOrderedAlertDays: businessProfile.material_not_ordered_alert_days,
        },
        new Date(),
        materialOrders,
      )
    : [];
  const sectionNames = new Map(materials.map((sec) => [sec.id, sec.name]));

  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const laborActualTotal = laborEntries.reduce((s, e) => s + Number(e.cost), 0);
  const laborActualHours = laborEntries.reduce((s, e) => s + Number(e.hours), 0);
  const laborPending = laborEntries
    .filter((e) => e.timesheet_id && e.timesheet?.status !== "approved")
    .reduce((s, e) => s + Number(e.cost), 0);
  const laborPlannedHours = materials.reduce((s, sec) => s + sectionLaborHours(sec), 0);

  // The Cost plan is the source of truth for predicted cost — every
  // section's typed lines + labor blocks, by type.
  const costPlan = costPlanSummary(quotes, changeOrders, materials);

  // "Actual" folds in every actual-cost source that's been logged so far —
  // reconciled material cost only once Complete (see materialActualCost's
  // doc comment above for why that one stays gated), expenses and actual
  // labor as soon as either has at least one entry. Null only when NOTHING
  // has been logged yet ("unknown," never a silent $0 — same convention
  // resolveCost() already documents).
  const hasActualCostData = (project.status === "complete" && materialsFullyReconciled) || expenses.length > 0 || laborEntries.length > 0;
  // Actual, by type — expenses matched through their category's cost type.
  const actualByType = actualCostByType(
    expenses,
    expenseCategories,
    laborActualTotal,
    project.status === "complete" && materialsFullyReconciled ? materialCostSummary.actualCost : 0,
  );
  const actualCost = hasActualCostData ? actualByType.total : null;
  // The overhead rate the job was sold with (0110) — else its quote's, else
  // the current settings.
  const projectOverheadRate =
    project.overhead_rate != null
      ? Number(project.overhead_rate)
      : headlineQuote?.overhead_rate != null
        ? Number(headlineQuote.overhead_rate)
        : burdenPerHour(overheadSettings);

  // Per feature (Phase E): planned vs actual, price and margin. Reconciled
  // material cost joins per feature under the same Complete gate as above.
  const materialActualByFeature =
    project.status === "complete" && materialsFullyReconciled
      ? materials.filter(countsTowardTotals).reduce((m, sec) => {
          const lines = sec.materials_items.filter((i) => (i.cost_type ?? "material") === "material");
          const k = sec.feature_id ?? null;
          m.set(k, (m.get(k) ?? 0) + sheetCostSummary(lines, deliveries, usageLogs).actualCost);
          return m;
        }, new Map<string | null, number>())
      : undefined;
  const featureRows: FeatureReport[] | null =
    projectFeatures.some((f) => f.status === "active")
      ? featureReports({
          features: projectFeatures,
          categories: jobCategories,
          sections: materials,
          quotes,
          changeOrders,
          expenses,
          expenseCategories,
          laborEntries,
          materialActual: materialActualByFeature,
          materialPending: !materialActualByFeature,
        })
      : null;
  const predictedCost = costPlan.planned.total > 0 ? costPlan.planned.total : null;
  const realCost = resolveCost(actualCost, predictedCost);
  const marginPct = contract > 0 && realCost != null ? Math.round(((contract - realCost) / contract) * 100) : null;
  const marginProfit = realCost != null ? contract - realCost : null;

  const weatherDelayDays = delayDays(scheduleDelays, project.id).weather;
  const durationStatus = projectDurationStatus(project, new Date(), weatherDelayDays);
  const crewName = crews.find((c) => c.id === project.crew_id)?.name ?? null;
  const scheduledWindowDays = scheduledWindowWorkingDays(project);
  const windowNote =
    project.estimated_duration_days &&
    scheduledWindowDays != null &&
    project.estimated_duration_days > scheduledWindowDays
      ? `Estimate exceeds scheduled window by ${pluralize(project.estimated_duration_days - scheduledWindowDays, "day")}`
      : null;

  const meta = projectStatusMeta(project.status);
  const recentExpenses = [...expenses]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const quotesSummary =
    quotes.length === 0
      ? "Not started"
      : `${pluralize(quotes.length, "quote")}${headlineQuote ? ` · ${quoteStatusMeta(headlineQuote.status).label} · ${formatCurrency(quoteTotal(headlineQuote.quote_sections))}` : ""}`;
  const invoicesSummary =
    invoices.length === 0
      ? "None yet"
      : `${pluralize(invoices.length, "invoice")} · ${formatCurrency(projectInvoicedTotal)}`;
  const expensesSummary =
    expenses.length === 0
      ? "None yet"
      : `${pluralize(expenses.length, "expense")} · ${formatCurrency(expensesTotal)}`;
  const approvedCOTotal = approvedChangeOrderTotal(changeOrders);
  const pendingCOCount = changeOrders.filter((co) => co.status === "sent").length;
  const changeOrdersSummary =
    changeOrders.length === 0
      ? "None yet"
      : `${approvedCOTotal > 0 ? "+" : ""}${formatCurrency(approvedCOTotal)} approved${pendingCOCount ? ` · ${pendingCOCount} pending` : ""}`;
  const pendingDeliveryCount = materialOrders.filter((mo) => mo.status !== "delivered").length;
  const materialOrdersSummary =
    materialOrders.length === 0 ? "None yet" : `${pluralize(materialOrders.length, "order")} · ${pendingDeliveryCount} pending`;
  const costPlanSummaryLine =
    materialsSheets.length === 0
      ? "Not started"
      : `${materialsSheets.length > 1 ? `${pluralize(materialsSheets.length, "cost plan")} · ` : ""}${formatCurrency(costPlan.planned.total)} planned${
          costPlan.projectedMarginPct != null ? ` · ${costPlan.projectedMarginPct.toFixed(0)}% margin` : ""
        }`;
  const laborSummary =
    laborPlannedHours === 0 && laborActualHours === 0
      ? "Nothing logged"
      : `${pluralize(Math.round(laborPlannedHours), "hr")} planned${laborActualHours > 0 ? ` · ${Math.round(laborActualHours)} actual` : ""}`;

  const statusSelect = (
    <Select
      value={project.status}
      onValueChange={(v) =>
        v === "in_progress" ? guardStart(() => statusMutation.mutate("in_progress")) : statusMutation.mutate(v as ProjectStatus)
      }
    >
      <SelectTrigger className="h-9 w-40 rounded-[0.625rem] border-border bg-card text-sm font-semibold">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{PROJECT_STATUS_META[s].label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title={project.name}
        subtitle={`${project.client?.name ?? "No client"}${crewName ? ` · ${crewName}` : ""}`}
        back={{ to: "/projects", label: "Projects" }}
        pills={<StatusPill meta={meta} className="!bg-white/20 !text-sidebar-foreground" />}
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <BackLink to="/projects" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Projects</BackLink>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">{project.name}</h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.client?.name ?? "No client"}
              {crewName ? ` · ${crewName}` : ""}
            </p>
          </div>
          {statusSelect}
        </div>
      </div>

      {/* Pre-sale: this project only holds an unwon opportunity's estimate,
          and is hidden from every job list until it's Won (isPreSaleProject). */}
      {isPreSaleProject(project) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-info/30 bg-info/10 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">This job hasn't been won yet.</p>
          <Link
            to={`/pipeline/${project.opportunities![0].id}`}
            className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to opportunity
          </Link>
        </div>
      )}

      <div className="md:hidden">{statusSelect}</div>

      {/* Features — compact inline chips, about half the header width on
          desktop / tablet, full width on phones. */}
      <div className="w-full md:w-1/2">
        <MeasuredCategoryMultiSelect
          projectId={id}
          value={projectCategoryIds(project)}
          onChange={(ids) => categoriesMutation.mutate(ids)}
          variant="compact"
        />
      </div>

      {linkedOpportunity && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-semibold text-muted-foreground">From pipeline:</span>
          <Link to={`/pipeline/${linkedOpportunity.id}`} className="font-bold text-primary hover:underline">
            {linkedOpportunity.title}
          </Link>
          <StatusPill meta={opportunityStageMeta(linkedOpportunity.stage)} />
        </div>
      )}

      {showWonBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-success/30 bg-success/10 p-4">
          <div className="flex items-center gap-2.5">
            <PartyPopper className="h-5 w-5 shrink-0 text-success" />
            <p className="text-sm font-bold text-foreground">Won — project ready</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showScheduleCta && (
              <Button asChild size="sm" variant="outline" className="font-semibold">
                <Link to="/bookings">
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  Schedule this job
                </Link>
              </Button>
            )}
            {depositCta === "open" && (
              <Button asChild size="sm" className="font-bold">
                <Link to={`/projects/${id}/invoices/${depositInvoice!.id}`}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send deposit invoice
                </Link>
              </Button>
            )}
            {depositCta === "create" && (
              <Button size="sm" className="font-bold" disabled={createDepositMut.isPending} onClick={() => createDepositMut.mutate()}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {createDepositMut.isPending ? "Preparing…" : "Send deposit invoice"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pre-construction checklist (0124) — from Won until the job starts. */}
      <PreconCard
        projectId={id}
        onRecordPayment={() => setRecordPaymentOpen(true)}
        onAssignCrew={() => document.getElementById("schedule-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}
      />

      <AlertDialog open={!!startGuard} onOpenChange={(o) => !o && setStartGuard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start with items still open?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>These required pre-construction items aren't done:</p>
                <ul className="mt-2 list-disc pl-5 text-foreground">
                  {startGuard?.open.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                startGuard?.apply();
                setStartGuard(null);
              }}
            >
              Start anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Material alerts — one slim line; Review opens them grouped by feature. */}
      <MaterialAlertsBar
        projectId={id}
        alerts={materialAlertList}
        sectionNames={sectionNames}
        context={startContext(project.scheduled_start_date)}
        onMarkOrdered={(ids) => markOrderedMut.mutate(ids)}
        onNotNeeded={(lineId) => notNeededMut.mutate(lineId)}
        busy={markOrderedMut.isPending || notNeededMut.isPending}
      />

      {project.status === "complete" && unreconciledLines.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning-strong/30 bg-warning/10 p-4">
          <p className="text-sm font-bold text-foreground">
            Reconcile materials — {pluralize(unreconciledLines.length, "line")} still need a leftover disposition.
          </p>
          <Button size="sm" className="font-bold" onClick={() => setReconcileOpen(true)}>
            Reconcile materials
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Tracking only once the job is Won / in progress — same rule as the
              cost plan (isProjectActive). */}
          {isProjectActive(project) && (
            <MaterialsTrackingCard
              summary={materialCostSummary}
              trackedLines={trackedLines}
              sections={materials.filter(countsTowardTotals)}
              usageLogs={usageLogs}
              onOpen={() => navigate(`/projects/${id}/materials`)}
              onLogUsage={(line) => setLogUsageLine(line)}
              onShowHistory={(line) => setHistoryLine(line)}
            />
          )}

          {/* Changing a Won job: an existing feature changes → change order;
              a completely new feature → add-on quote. */}
          {isProjectActive(project) && (
            <div className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Change the job</h3>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${id}/change-orders`)}
                  className="flex min-h-14 flex-col items-start justify-center rounded-xl border border-border px-4 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <span className="text-sm font-bold text-foreground">Change order</span>
                  <span className="text-xs text-muted-foreground">Change an existing feature — bigger, upgraded, removed or credited</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddWorkOpen(true)}
                  className="flex min-h-14 flex-col items-start justify-center rounded-xl border border-border px-4 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <span className="text-sm font-bold text-foreground">Add new work</span>
                  <span className="text-xs text-muted-foreground">A completely new feature — priced on an add-on quote</span>
                </button>
              </div>
            </div>
          )}
          <AddNewWorkDialog open={addWorkOpen} onOpenChange={setAddWorkOpen} projectId={id} clientId={project.client_id ?? null} />

          {/* Section nav */}
          <div className="grid gap-3 sm:grid-cols-2">
            <HubCard title="Cost plan" summary={costPlanSummaryLine} onOpen={() => navigate(`/projects/${id}/materials`)} />
            <HubCard title="Labor log" summary={laborSummary} onOpen={() => navigate(`/projects/${id}/labor`)} />
            <HubCard title="Quotes" summary={quotesSummary} onOpen={() => navigate(`/projects/${id}/quotes`)} />
            <HubCard title="Invoices" summary={invoicesSummary} onOpen={() => navigate(`/projects/${id}/invoices`)} />
            <HubCard title="Expenses" summary={expensesSummary} onOpen={() => navigate(`/projects/${id}/expenses`)} />
            <HubCard
              title="Change orders"
              summary={changeOrdersSummary}
              onOpen={() => navigate(`/projects/${id}/change-orders`)}
            />
            <HubCard
              title="Material orders"
              summary={materialOrdersSummary}
              onOpen={() => navigate(`/projects/${id}/material-orders`)}
            />
          </div>

          {/* Profit summary (real) — predicted cost is now the Cost Plan's
              full total (materials + labor + subs + equipment + other), not
              materials alone; actual cost folds in actual labor the moment
              any is logged. See the Cost Plan/Labor pages for the breakdown. */}
          <ProfitSummaryCard
            jobOpen={project.status !== "complete"}
            quoted={contract || null}
            predictedCost={predictedCost}
            actualCost={actualCost}
            planned={costPlan.planned}
            actual={hasActualCostData ? actualByType : null}
            featureRows={featureRows}
            overhead={{
              rate: projectOverheadRate,
              plannedManHours: plannedManHours(materials),
              actualManHours: laborActualHours,
              targetMarginPct: project.target_margin_pct ?? overheadSettings?.target_margin_pct ?? null,
              settings: overheadSettings ?? null,
              source:
                project.overhead_rate != null
                  ? "the rate this job was sold with"
                  : headlineQuote?.overhead_rate != null
                    ? "the rate stored on its quote"
                    : "your current overhead (this job has no stored rate)",
            }}
          />
          {/* Timesheets (0131): labor from timesheets not yet approved is
              already in the actual cost above (same rate / overtime / burden
              math) — say how much of it is still pending. */}
          {laborPending > 0 && (
            <p className="-mt-3 px-1 text-xs text-warning-strong">
              Includes {formatCurrency(laborPending)} of labor from timesheets not approved yet.{" "}
              <Link to="/timesheets" className="font-semibold underline">
                Review timesheets
              </Link>
            </p>
          )}

          {/* Planned vs actual + job context + closeout (Feature 5) — after
              Won; before that just the job context chips. Internal only. */}
          {isProjectActive(project) || project.status === "complete" ? (
            <PlannedVsActualCard projectId={id} />
          ) : (
            <section className="card-surface p-5">
              <h3 className="text-base font-bold text-foreground">Job context</h3>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Quick site facts used to compare this job with similar ones. All optional.</p>
              <JobContextChips project={project} />
            </section>
          )}
          <CloseoutDialog projectId={id} open={closeoutOpen} onOpenChange={setCloseoutOpen} />

          {/* Client selections (0115) — approved choices per feature, locked;
              change requests; changes only via change orders. */}
          <ProjectSelectionsCard projectId={id} />

          {/* Costs to date — real logged expenses only */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Costs to date</h3>
              <Link
                to={`/projects/${id}/expenses`}
                className="text-[13px] font-semibold text-primary"
              >
                {expenses.length ? "Manage" : "Add expense"}
              </Link>
            </div>
            <p className="mt-1 text-[28px] font-extrabold tracking-tight tabular-nums text-foreground">
              {formatCurrency(expensesTotal)}
            </p>
            {expenses.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No expenses logged yet.</p>
            ) : (
              <div className="mt-3">
                {recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {e.name || "Expense"}
                      {e.date && <span className="text-muted-subtle"> · {expenseDate(e.date)}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </div>
                ))}
                {expenses.length > recentExpenses.length && (
                  <p className="pt-2 text-xs font-semibold text-muted-foreground">
                    +{expenses.length - recentExpenses.length} more
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <section className="card-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-foreground">Money</h3>
              {billing && <span className={projectBillingStatusMeta(billing).badge}>{projectBillingStatusMeta(billing).label}</span>}
            </div>
            <div className="mt-2">
              <MoneyRow label="Contract value" value={contract > 0 ? formatCurrency(contract) : "—"} />
              <MoneyRow label="Invoiced" value={formatCurrency(money.invoiced)} />
              <MoneyRow label="Payments received" value={formatCurrency(money.received)} />
              <MoneyRow label="Unpaid invoice balance" value={formatCurrency(money.unpaidInvoiceBalance)} />
              {money.unallocatedCredit > 0.004 && (
                <MoneyRow label="Unallocated credit" value={<span className="text-success">{formatCurrency(money.unallocatedCredit)}</span>} />
              )}
              <MoneyRow
                label={money.overpaid > 0.004 ? "Credit balance (overpaid)" : "Remaining project balance"}
                value={money.overpaid > 0.004 ? <span className="text-success">{formatCurrency(money.overpaid)}</span> : formatCurrency(money.remaining)}
                strong
              />
            </div>
            <Button className="mt-3 w-full" variant="outline" onClick={() => setRecordPaymentOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Record payment
            </Button>
            <div className="mt-4">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Payments</div>
              <PaymentsList payments={payments} invoices={invoices} projectId={id} />
            </div>
            <RecordPaymentSheet open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen} projectId={id} invoices={invoices} />
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-hairline pt-4">
              <Button variant="ghost" size="sm" className="justify-center" asChild>
                <Link to={`/projects/${id}/client-view`}>
                  <Eye className="mr-1.5 h-4 w-4" />
                  Client view
                </Link>
              </Button>
              <DownloadSummaryButton
                variant="ghost"
                label="Project summary"
                className="h-9 justify-center px-3 text-sm"
                loadDetail={() => getClientViewProject(id)}
                getLogoUrl={async (path) => (await getSignedImageUrls([path]))[path] ?? null}
              />
            </div>
            {depositOverdue && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Deposit not received
              </div>
            )}
            {marginProfit != null && (
              <div className="mt-3 rounded-xl bg-primary/10 p-3">
                <div className="text-xs font-semibold text-success">
                  {actualCost != null ? "Actual" : "Projected"} margin
                </div>
                <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-foreground">
                  {marginPct}% <span className="text-sm font-bold text-muted-foreground">· {formatCurrency(marginProfit)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Crew work order (0125) — once the job is won. */}
          {project.status !== "estimating" && project.status !== "lost" && <CrewWorkOrderCard project={project} />}

          {/* Google review request (0122) — completed jobs with a client. */}
          {project.status === "complete" && project.client_id && <ProjectReviewCard projectId={project.id} />}
          {/* Care & maintenance (0127) — reminders to bring past clients back. */}
          {project.status === "complete" && project.client_id && <MaintenanceCard project={project} />}

          <section id="schedule-card" className="card-surface scroll-mt-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-foreground">Schedule</h3>
              <ScheduleMenu projectId={project.id} start={project.scheduled_start_date} end={project.scheduled_end_date} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-start" className="text-xs font-semibold text-muted-foreground">
                  Start date
                </Label>
                <Input
                  id="scheduled-start"
                  type="date"
                  value={project.scheduled_start_date ?? ""}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-end" className="text-xs font-semibold text-muted-foreground">
                  End date
                </Label>
                <Input
                  id="scheduled-end"
                  type="date"
                  min={project.scheduled_start_date ?? undefined}
                  value={project.scheduled_end_date ?? ""}
                  onChange={(e) => setScheduledEnd(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-subtle">
              Feeds the Dashboard Bookings card and the Bookings calendar once this job is
              scheduled.
            </p>
            {/* Client heads-up (0121) — until the change is sent or dismissed. */}
            <HeadsUpReminder projectId={project.id} />
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Crew</Label>
              <CrewSelect
                value={project.crew_id}
                onChange={(crewId) => scheduleMutation.mutate({ crew_id: crewId })}
                className="h-10"
              />
            </div>

            {/* Forecast on the schedule (0119) — upcoming work days within
                the forecast range; tap a day for why it's flagged. */}
            {project.scheduled_start_date && project.status !== "complete" && project.status !== "lost" && (
              <div className="mt-4 border-t border-hairline pt-4">
                <h4 className="mb-2 text-sm font-bold text-foreground">Forecast</h4>
                <ProjectForecastStrip
                  projectId={project.id}
                  start={project.scheduled_start_date}
                  end={project.scheduled_end_date}
                />
              </div>
            )}

            {/* Rain delay action (0120) — this job's delays, with Undo. */}
            {scheduleDelays.length > 0 && (
              <div className="mt-4 border-t border-hairline pt-4">
                <h4 className="mb-2 text-sm font-bold text-foreground">Delays</h4>
                <ScheduleDelaysList projectId={project.id} canUndo />
              </div>
            )}

            {/* Estimated duration — part of the job's schedule, so it lives in
                this card (it used to be its own card below). Same behavior:
                estimate in crew days, actual start/end, elapsed vs estimate,
                flagged red once it runs over. */}
            <div className="mt-4 border-t border-hairline pt-4">
              <h4 className="text-sm font-bold text-foreground">Estimated duration</h4>

              {project.estimated_duration_days == null ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">No estimate set</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Days"
                      value={estimateDraft}
                      onChange={(e) => setEstimateDraft(e.target.value)}
                      className="h-9 w-20"
                      aria-label="Estimated crew days"
                    />
                    <Button
                      size="sm"
                      disabled={!estimateDraft || Number(estimateDraft) <= 0 || durationMutation.isPending}
                      onClick={() => {
                        const days = parseInt(estimateDraft, 10);
                        if (days > 0) {
                          durationMutation.mutate({ estimated_duration_days: days });
                          setEstimateDraft("");
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={project.estimated_duration_days}
                      onChange={(e) => {
                        const days = e.target.value ? parseInt(e.target.value, 10) : null;
                        durationMutation.mutate({ estimated_duration_days: days && days > 0 ? days : null });
                      }}
                      className="h-10 w-20"
                      aria-label="Estimated crew days"
                    />
                    <span className="text-sm text-muted-foreground">crew days estimated</span>
                  </div>
                  {weatherDelayDays > 0 && (
                    <p className="mt-1 text-xs font-semibold text-info">
                      {pluralize(project.estimated_duration_days, "working day")} · +{pluralize(weatherDelayDays, "weather day")} (not counted as running over)
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="actual-start" className="text-xs font-semibold text-muted-foreground">
                        Actual start
                      </Label>
                      <Input
                        id="actual-start"
                        type="date"
                        value={project.actual_start_date ?? ""}
                        onChange={(e) =>
                          e.target.value && !project.actual_start_date
                            ? guardStart(() => durationMutation.mutate({ actual_start_date: e.target.value }))
                            : durationMutation.mutate({ actual_start_date: e.target.value || null })
                        }
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="actual-end" className="text-xs font-semibold text-muted-foreground">
                        Actual end
                      </Label>
                      <Input
                        id="actual-end"
                        type="date"
                        min={project.actual_start_date ?? undefined}
                        value={project.actual_end_date ?? ""}
                        onChange={(e) =>
                          durationMutation.mutate({ actual_end_date: e.target.value || null })
                        }
                        className="h-10"
                      />
                    </div>
                  </div>

                  {(durationStatus.state === "in_progress" || durationStatus.state === "complete") && (
                    <div className="mt-3">
                      {(() => {
                        const isOver =
                          (durationStatus.state === "in_progress" && durationStatus.overDays > 0) ||
                          (durationStatus.state === "complete" && durationStatus.diffDays > 0);
                        const label =
                          durationStatus.state === "in_progress"
                            ? `Day ${durationStatus.elapsedDays} of ${durationStatus.estimateDays}${
                                durationStatus.weatherDays > 0 ? ` +${durationStatus.weatherDays} weather` : ""
                              }${
                                durationStatus.overDays > 0
                                  ? ` · ${pluralize(durationStatus.overDays, "day")} over`
                                  : ""
                              }`
                            : `Took ${pluralize(durationStatus.totalDays, "day")}${
                                durationStatus.weatherDays > 0 ? ` (${durationStatus.weatherDays} weather)` : ""
                              } · ${
                                durationStatus.diffDays > 0
                                  ? `${pluralize(durationStatus.diffDays, "day")} over estimate`
                                  : durationStatus.diffDays < 0
                                    ? `finished ${pluralize(-durationStatus.diffDays, "day")} early`
                                    : "right on estimate"
                              }`;
                        const progressPct = Math.min(
                          100,
                          ((Math.max(0, (durationStatus.state === "in_progress"
                            ? durationStatus.elapsedDays
                            : durationStatus.totalDays) - durationStatus.weatherDays)) /
                            durationStatus.estimateDays) *
                            100,
                        );
                        return (
                          <>
                            <p className={cn("text-sm font-semibold", isOver ? "text-destructive" : "text-foreground")}>
                              {label}
                            </p>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isOver ? "bg-destructive" : "bg-primary",
                                )}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {windowNote && <p className="mt-3 text-[11px] text-warning">{windowNote}</p>}
                </>
              )}
            </div>
          </section>

          <div id="measurements" className="scroll-mt-4">
            <ProjectMeasurementsCard
              projectId={id}
              categoryIds={projectCategoryIds(project)}
              focusRequest={measureFocus.n}
              focusCategoryId={measureFocus.categoryId}
            />
          </div>

          {project.client && (
            <section
              role="button"
              tabIndex={0}
              onClick={() => project.client_id && navigate(`/clients/${project.client_id}/edit`)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && project.client_id) {
                  e.preventDefault();
                  navigate(`/clients/${project.client_id}/edit`);
                }
              }}
              className="card-surface group w-full cursor-pointer p-5 text-left transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Client</h3>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2 text-sm font-bold text-foreground">{project.client.name}</p>
              <div className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
                {project.client.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{project.client.address}</span>
                  </p>
                )}
                {project.client.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`tel:${project.client.phone}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.phone}
                    </a>
                  </p>
                )}
                {project.client.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <a
                      href={`mailto:${project.client.email}`}
                      className="hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client.email}
                    </a>
                  </p>
                )}
              </div>
              {project.client.email && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={inviteToHubMut.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    inviteToHubMut.mutate();
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {inviteToHubMut.isPending ? "Sending…" : "Invite to client hub"}
                </Button>
              )}
            </section>
          )}

          <section className="card-surface p-5">
            <h3 className="text-base font-bold text-foreground">Activity</h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                      {timeAgo(e.created_at)}
                    </div>
                    <div className="mt-0.5 text-[13px] text-foreground/80">{e.summary}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Progress updates (0126) — post, review crew posts, share to the Hub.
          Below the working sections (measurements, cost plan, quotes, schedule),
          above the photo gallery it draws from. */}
      {project.status !== "estimating" && project.status !== "lost" && <ProgressUpdatesCard project={project} />}

      <PhotoGallery
        owner={{ type: "project", id }}
        title="Project Images"
        emptyText="No photos yet — add progress photos, before/after, or site conditions."
      />
      <ProjectMessagesCard projectId={id} clientId={project.client_id} />
      <FieldUpdatesCard projectId={id} />

      {logUsageLine && (
        <LogUsageDialog open={!!logUsageLine} onOpenChange={(open) => !open && setLogUsageLine(null)} line={logUsageLine} />
      )}
      {historyLine && (
        <UsageLogHistoryDialog open={!!historyLine} onOpenChange={(open) => !open && setHistoryLine(null)} line={historyLine} />
      )}

      <ReconcileMaterialsDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        projectId={id}
        lines={unreconciledLines}
        deliveries={deliveries}
        usageLogs={usageLogs}
      />
    </div>
  );
}

function profitColor(v: number): string {
  return v >= 0 ? "text-success" : "text-destructive";
}

function ProfitSummaryCard({
  jobOpen = false,
  quoted,
  predictedCost,
  actualCost,
  planned,
  actual,
  featureRows,
  overhead,
}: {
  /** Not Complete yet — costs are still coming in, so "actual" figures are
   * spend so far, and there's no final variance to show. */
  jobOpen?: boolean;
  quoted: number | null;
  predictedCost: number | null;
  actualCost: number | null;
  /** Per-feature breakdown — rows add up to the totals above. */
  featureRows?: FeatureReport[] | null;
  /** Fully loaded profit (0110, internal): overhead through planned /
   * actual labor hours at the rate the job was sold with. */
  overhead?: {
    rate: number | null;
    plannedManHours: number;
    actualManHours: number;
    targetMarginPct: number | null;
    settings: OverheadSettings | null;
    /** Where the rate came from, in words. */
    source: string;
  };
  /** Cost plan by type (estimated side). */
  planned: CostTotals;
  /** Actual spend by type — null until anything's been logged. */
  actual: CostTotals | null;
}) {
  const typeRows = COST_BUCKETS.filter((k) => planned[k] > 0 || (actual?.[k] ?? 0) > 0);
  const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
  const predictedProfit = quoted !== null && predictedCost !== null ? quoted - predictedCost : null;
  const actualProfit = quoted !== null && actualCost !== null ? quoted - actualCost : null;
  const predictedMargin = predictedProfit !== null && quoted ? (predictedProfit / quoted) * 100 : null;
  const actualMargin = actualProfit !== null && quoted ? (actualProfit / quoted) * 100 : null;
  // Profit variance = actual − estimated profit. Positive = ahead of the
  // estimate (green), negative = behind (red). % is against the estimate.
  const profitVariance = predictedProfit !== null && actualProfit !== null ? actualProfit - predictedProfit : null;
  const profitVariancePct =
    profitVariance !== null && predictedProfit ? (profitVariance / Math.abs(predictedProfit)) * 100 : null;

  return (
    <section className="card-surface space-y-4 p-5">
      <h3 className="text-base font-bold text-foreground">Profit summary</h3>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Metric label="Quoted" value={money(quoted)} />
        <Metric label="Predicted cost" value={money(predictedCost)} />
        <Metric label={jobOpen ? "Spent so far" : "Actual cost"} value={money(actualCost)} />
      </div>
      {/* By cost type: the Cost plan's estimate vs actual spend (expenses
          matched through their category's cost type + logged labor). */}
      {typeRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-hairline text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 sm:gap-x-4 bg-muted/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
            <span>Type</span>
            <span className="w-[4.5rem] text-right sm:w-20">Planned</span>
            <span className="w-[4.5rem] text-right sm:w-20">{jobOpen ? "Spent" : "Actual"}</span>
            {/* Mid-job the difference is budget left, not a result. */}
            <span className="w-[4.5rem] text-right sm:w-20">{jobOpen ? "Left" : "Variance"}</span>
          </div>
          {typeRows.map((k) => {
            const a = actual?.[k] ?? null;
            const v = a !== null ? planned[k] - a : null;
            return (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 sm:gap-x-4 border-t border-hairline px-3 py-1.5 tabular-nums">
                <span className="font-semibold text-foreground">{COST_TYPE_GROUP_LABEL[k]}</span>
                <span className="w-[4.5rem] text-right sm:w-20">{formatCurrency(planned[k])}</span>
                <span className="w-[4.5rem] text-right sm:w-20">{a === null ? "—" : formatCurrency(a)}</span>
                <span
                  className={cn(
                    "w-[4.5rem] text-right sm:w-20 font-semibold",
                    v === null ? "text-muted-foreground" : v < 0 ? "text-destructive" : jobOpen ? "text-foreground" : "text-success",
                  )}
                >
                  {v === null ? "—" : `${v >= 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {(predictedProfit !== null || actualProfit !== null) && (
        <div className="grid grid-cols-1 gap-4 border-t border-hairline pt-3 sm:grid-cols-2">
          {predictedProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Predicted profit</p>
              <p className={cn("text-lg font-extrabold", profitColor(predictedProfit))}>
                {formatCurrency(predictedProfit)}
                {predictedMargin !== null && <span className="ml-1.5 text-sm font-bold">({predictedMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
          {actualProfit !== null && (
            <div>
              <p className="text-sm text-muted-foreground">{jobOpen ? "Profit on spend so far" : "Actual profit"}</p>
              <p className={cn("text-lg font-extrabold", profitColor(actualProfit))}>
                {formatCurrency(actualProfit)}
                {actualMargin !== null && <span className="ml-1.5 text-sm font-bold">({actualMargin.toFixed(0)}%)</span>}
              </p>
            </div>
          )}
        </div>
      )}
      {profitVariance !== null && jobOpen && (
        <p className="text-xs text-muted-foreground">Costs are still coming in — profit variance shows once the job is Complete.</p>
      )}
      {profitVariance !== null && !jobOpen && (
        <div
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3.5 py-2.5",
            profitVariance >= 0 ? "bg-success/10" : "bg-destructive/10",
          )}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Profit variance</p>
            <p className="text-xs text-muted-foreground">
              {profitVariance >= 0 ? "Ahead of estimate" : "Behind estimate"}
            </p>
          </div>
          <p className={cn("text-lg font-extrabold tabular-nums", profitVariance >= 0 ? "text-success" : "text-destructive")}>
            {profitVariance >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(profitVariance))}
            {profitVariancePct !== null && (
              <span className="ml-1.5 text-sm font-bold">
                ({profitVariance >= 0 ? "+" : "−"}
                {Math.abs(profitVariancePct).toFixed(0)}%)
              </span>
            )}
          </p>
        </div>
      )}
      {overhead && quoted != null && (
        <div className="space-y-2 border-t border-hairline pt-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Fully loaded · internal</div>
          {overhead.rate == null ? (
            <SetUpOverheadLink />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {predictedCost !== null && (
                <FullyLoaded
                  label="Predicted fully loaded profit"
                  tc={trueCost({ direct: predictedCost, manHours: overhead.plannedManHours, rate: overhead.rate, price: quoted, targetMarginPct: overhead.targetMarginPct })}
                  hoursText={`${formatLabor(overhead.plannedManHours, overhead.settings)} planned`}
                />
              )}
              {actualCost !== null && (
                <FullyLoaded
                  label={jobOpen ? "Fully loaded profit on spend so far" : "Actual fully loaded profit"}
                  tc={trueCost({ direct: actualCost, manHours: overhead.actualManHours, rate: overhead.rate, price: quoted, targetMarginPct: overhead.targetMarginPct })}
                  hoursText={`${formatLabor(overhead.actualManHours, overhead.settings)} logged`}
                />
              )}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Overhead at {formatCurrency(overhead.rate)}/hr — {overhead.source}.
              </p>
            </div>
          )}
        </div>
      )}
      {featureRows && featureRows.length > 1 && (
        <div className="border-t border-hairline pt-3">
          <FeatureProfitTable reports={featureRows} projected={jobOpen} />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}

/** Rows shown before "See more" on the project page's Materials card. */
const MATERIAL_ROWS_PREVIEW = 5;

/**
 * The project page's Materials card — logs quantity USED as the job goes.
 * One row per tracked line (the per-line Track flag, 0086): used vs.
 * estimated in the line's own unit, a progress bar, and the dollar values
 * derived from unit cost (never typed in). "Log usage" adds an entry (in
 * the line's unit, optional date/note); "History" edits or deletes them.
 * Entries sum into the line's "Used" in the estimated → ordered → delivered
 * → used tracking. Ordering / delivered stay with Material deliveries.
 */
function MaterialsTrackingCard({
  summary,
  trackedLines,
  sections,
  usageLogs,
  onOpen,
  onLogUsage,
  onShowHistory,
}: {
  summary: ReturnType<typeof sheetCostSummary>;
  trackedLines: MaterialsItem[];
  /** Cost plan sections (one per feature + General), in plan order — the group headers. */
  sections: MaterialsSection[];
  usageLogs: MaterialsUsageLog[];
  onOpen: () => void;
  onLogUsage: (line: MaterialsItem) => void;
  onShowHistory: (line: MaterialsItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const lines = executionTrackedLines(trackedLines);
  const rows = lines.map((line) => {
    const est = effectiveEstimate(line);
    const used = usedQuantity(line, usageLogs);
    const entries = usageLogs.filter((u) => u.materials_item_id === line.id).length;
    return { line, estQty: est.quantity, used, unitCost: est.unit_cost, entries };
  });
  const usedValue = rows.reduce((sum, r) => sum + r.used * r.unitCost, 0);
  const estValue = rows.reduce((sum, r) => sum + r.estQty * r.unitCost, 0);
  const qty = (n: number) => String(Math.round(n * 100) / 100);
  // Grouped under their feature (Seating Wall 1, Fire Pit…) in Cost plan
  // order; General last. Collapsed, the first few rows show across groups.
  const groups = sections
    .map((s) => ({ id: s.id, title: s.is_general ? "General" : s.name, rows: rows.filter((r) => r.line.section_id === s.id) }))
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => Number(a.title === "General") - Number(b.title === "General"));
  let budget = showAll ? Infinity : MATERIAL_ROWS_PREVIEW;
  const shownGroups = groups
    .map((g) => {
      const take = g.rows.slice(0, Math.max(0, budget));
      budget -= take.length;
      return { ...g, rows: take };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-foreground">Materials</h3>
        <button type="button" onClick={onOpen} className="shrink-0 text-xs font-semibold text-primary">
          Open cost plan →
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tracked materials yet — add lines on the cost plan.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Used <span className="font-bold tabular-nums text-foreground">{formatCurrency(usedValue)}</span> of{" "}
            <span className="tabular-nums">{formatCurrency(estValue)}</span> estimated · log what the crew uses as you go
          </p>
          <div className="mt-3 space-y-4">
            {shownGroups.map((g) => (
              <div key={g.id}>
                {groups.length > 1 && (
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{g.title}</p>
                )}
                <ul className="divide-y divide-hairline">
                  {g.rows.map(({ line, estQty, used, unitCost, entries }) => {
                    const unit = line.unit || "units";
                    const pct = estQty > 0 ? Math.min(100, (used / estQty) * 100) : used > 0 ? 100 : 0;
                    const over = estQty > 0 && used > estQty;
                    return (
                      <li key={line.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{materialLineLabel(line)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              <span className={cn("font-bold", over ? "text-destructive" : "text-foreground")}>
                                {qty(used)} / {qty(estQty)} {unit}
                              </span>{" "}
                              used · {formatCurrency(used * unitCost)} of {formatCurrency(estQty * unitCost)}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 shrink-0 px-2.5 text-xs font-bold" onClick={() => onLogUsage(line)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Log usage
                          </Button>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
                          </div>
                          {entries > 0 && (
                            <button type="button" onClick={() => onShowHistory(line)} className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
                              History ({entries})
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {rows.length > MATERIAL_ROWS_PREVIEW && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm font-semibold text-primary hover:underline">
              {showAll ? "See less" : `See all ${rows.length} materials`}
            </button>
          )}
        </>
      )}
      {/* Not-ordered / over-estimate live in the alerts bar above (one story). */}
      {summary.unplannedCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="badge-status badge-pending">{pluralize(summary.unplannedCount, "unplanned item")}</span>
        </div>
      )}
    </div>
  );
}

function ReconcileMaterialsDialog({
  open,
  onOpenChange,
  projectId,
  lines,
  deliveries,
  usageLogs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  lines: MaterialsItem[];
  deliveries: DeliveryLineWithOrderStatus[];
  usageLogs: MaterialsUsageLog[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [choices, setChoices] = useState<Record<string, { disposition: "returned" | "kept" | "waste"; credit: string }>>({});

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const line of lines) {
        const choice = choices[line.id];
        if (!choice) continue;
        await reconcileMaterialsItem(line.id, {
          disposition: choice.disposition,
          return_credit: choice.disposition === "returned" ? parseFloat(choice.credit) || 0 : null,
        });
        const baseline = currentBaseline(line);
        if (baseline) {
          await recordMaterialLearningSnapshot({
            project_id: projectId,
            catalog_product_id: line.catalog_product_id,
            material_name: materialLineLabel(line),
            baseline_quantity: baseline.quantity,
            final_used: usedQuantity(line, usageLogs),
            unit: line.unit,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Materials reconciled" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconcile materials</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          These lines have leftover delivered material — say what happened to it. Returned quantities can carry a credit
          that reduces actual material cost.
        </p>
        <div className="space-y-3">
          {lines.map((line) => {
            const delivered = deliveredQuantity(line, deliveries);
            const used = usedQuantity(line, usageLogs);
            const leftover = leftoverQuantity(delivered, used);
            const choice = choices[line.id] ?? { disposition: "kept" as const, credit: "" };
            return (
              <div key={line.id} className="rounded-lg border border-hairline p-3">
                <p className="text-sm font-bold text-foreground">
                  {materialLineLabel(line)} — {leftover} {line.unit ?? ""} leftover
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    value={choice.disposition}
                    onValueChange={(v) => setChoices((c) => ({ ...c, [line.id]: { ...choice, disposition: v as "returned" | "kept" | "waste" } }))}
                  >
                    <SelectTrigger className="h-9 w-40 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="returned">Returned to supplier</SelectItem>
                      <SelectItem value="kept">Kept in stock</SelectItem>
                      <SelectItem value="waste">Waste</SelectItem>
                    </SelectContent>
                  </Select>
                  {choice.disposition === "returned" && (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={choice.credit}
                      onChange={(e) => setChoices((c) => ({ ...c, [line.id]: { ...choice, credit: e.target.value } }))}
                      placeholder="Credit $"
                      className="h-9 w-32"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button className="w-full font-bold" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save reconciliation"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function HubCard({ title, summary, onOpen }: { title: string; summary: ReactNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface group flex items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * Client Hub Phase 5 — the contractor's side of the per-project message
 * thread. The client's side lives in the portal
 * (PortalProjectOverview.tsx); this is deliberately not a second inbox —
 * every message sent from either side also lands in the existing
 * Communications activity log via a dual-write (see sendProjectMessage()/
 * migration 0067's portal_send_message()).
 */
function ProjectMessagesCard({ projectId, clientId }: { projectId: string; clientId: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["project-messages", projectId],
    queryFn: () => listProjectMessages(projectId),
  });

  const allPaths = messages.flatMap((m) => m.image_paths);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["project-messages-urls", projectId, allPaths],
    queryFn: () => getSignedImageUrls(allPaths),
    enabled: allPaths.length > 0,
  });

  const sendMut = useMutation({
    mutationFn: () => sendProjectMessage(projectId, clientId, body, files),
    onSuccess: () => {
      setBody("");
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["project-messages", projectId] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canSend = (body.trim().length > 0 || files.length > 0) && !sendMut.isPending;

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Messages</h3>
        {messages.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(messages.length, "message")}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No messages yet — send an update or question to the client below.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2",
                m.sender === "contractor" ? "ml-auto bg-primary/10" : "bg-muted",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  {m.sender === "contractor" ? "You" : "Client"}
                </span>
                <span className="text-[11px] text-muted-subtle">{timeAgo(m.created_at)}</span>
              </div>
              {m.body && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/80">{m.body}</p>}
              {m.image_paths.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.image_paths.map((path) =>
                    signedUrls[path] ? (
                      <img
                        key={path}
                        src={signedUrls[path]}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div key={path} className="flex h-16 w-16 items-center justify-center rounded-lg bg-black/10">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
                      </div>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message to the client…"
          rows={2}
          className="min-h-0 flex-1 resize-none"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary"
          aria-label="Attach photos"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) setFiles((prev) => [...prev, ...picked]);
          }}
        />
        <Button
          type="button"
          size="icon"
          onClick={() => sendMut.mutate()}
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0"
        >
          {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}

/**
 * Free-text updates employees (0043) posted from the field — read-only
 * from the owner's side (an employee's own project screen is where they
 * get written), with a delete affordance since the owner's "own"
 * project_notes policy already permits it. Employee-uploaded photos need
 * no equivalent card here — they land in the exact same project_images
 * table/query the PhotoGallery above already reads, regardless of who
 * uploaded them.
 */
function FieldUpdatesCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["project-notes", projectId],
    queryFn: () => listProjectNotes(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProjectNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-notes", projectId] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (!isLoading && notes.length === 0) return null;

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Field updates</h3>
        {notes.length > 0 && (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {pluralize(notes.length, "update")}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{n.employee_name ?? "Team update"}</span>
                  <span className="text-[11px] text-muted-subtle">{timeAgo(n.created_at)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/80">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteMut.mutate(n.id)}
                className="shrink-0 text-muted-subtle transition-colors hover:text-destructive"
                aria-label="Delete update"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FullyLoaded({ label, tc, hoursText }: { label: string; tc: TrueCost; hoursText: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-extrabold tabular-nums", TRUE_COST_STATUS_CLASS[tc.status])}>
        {formatCurrency(tc.fullyLoadedProfit)}
        {tc.fullyLoadedMarginPct != null && <span className="ml-1.5 text-sm font-bold">({tc.fullyLoadedMarginPct.toFixed(0)}%)</span>}
      </p>
      <p className="text-[11px] text-muted-subtle">
        Overhead {formatCurrency(tc.overhead)} · {hoursText}
      </p>
    </div>
  );
}

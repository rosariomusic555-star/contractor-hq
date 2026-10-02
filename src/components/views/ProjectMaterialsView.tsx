import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  BookOpen,
  Lock,
  Wand2,
  Calculator,
  X,
  Eye,
  EyeOff,
  FileDown,
  History,
  AlertTriangle,
  HardHat,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { StatusPill } from "@/components/common/StatusPill";
import { ReorderControls } from "@/components/common/ReorderControls";
import { SectionCard } from "@/components/common/SectionCard";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { useSectionReorder } from "@/hooks/use-section-reorder";
import { groupByType } from "@/lib/sectionGrouping";
import { remapDraftIds } from "@/lib/draftRemap";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { CollapseAllLinks } from "@/components/common/CollapseAllLinks";
import { ItemsCollapseToggle } from "@/components/common/ItemsCollapse";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  getProject,
  getBusinessProfile,
  listMaterials,
  listMaterialsBySheet,
  listMaterialsSheets,
  listSmartSectionSettings,
  listProjectFeatures,
  listPendingCostChanges,
  listPossibleSubs,
  getOverheadSettings,
  pendingSelectionsCost,
  pickHeadlineQuote,
  projectContractValue,
  listFeatureHistory,
  listExpenses,
  listLaborEntries,
  listQuotes,
  createProjectFeature,
  updateProjectFeature,
  ensureFeatureSections,
  createMaterialsSheet,
  listExpenseCategories,
  listPriceBookItems,
  listProductCatalog,
  listCatalogPriceOverrides,
  upsertCatalogPriceOverride,
  createMaterialsSection,
  updateMaterialsSection,
  deleteMaterialsSection,
  addMaterialsItem,
  updateMaterialsItem,
  deleteMaterialsItem,
  listChangeOrders,
  listMaterialOrders,
  listUsageLogsForItems,
  addUsageLog,
  reviseMaterialBaseline,
  matchMaterialOrderItem,
  materialOrderUnitLabel,
  listCategories,
  listMaterialCategories,
  materialCategoryIdByName,
  projectCategoryIds,
  type Category,
  type MaterialCategory,
  type MaterialsSection,
  type MaterialsSheet,
  type MaterialsItem,
  type Quote,
  type ChangeOrder,
  type MaterialOrderItem,
  type ExpenseCategory,
  type PriceBookItem,
  type ProductCatalogItem,
  type CatalogPriceOverride,
  getOpportunityByProjectId,
} from "@/lib/api";
import { SmartSectionDialog } from "@/components/materials/SmartSectionDialog";
import { countsTowardTotals, featureName, liveFeatures, type FeatureStatus } from "@/lib/features";
import { combinedLineName, possibleSubsKey, placeSubSuggestions, sectionForCategory, type SubPlanSection, type SubSuggestion } from "@/lib/possibleSubs";
import { AddPossibleSubDialog, type AddSubChoice } from "@/components/materials/AddPossibleSubDialog";
import { draftChanges, EDITED_CLASS } from "@/lib/draftChanges";
import { addonQuoteNumbers, changeOrderNumbers, featurePrice, featureReports } from "@/lib/featureFinancials";
import { FeatureReportStrip } from "@/components/projects/FeatureReport";
import { PlannedVsActualCard } from "@/components/planned-actual/PlannedVsActualCard";
import { LaborInsight } from "@/components/planned-actual/EstimatingHints";
import { costChangeDelta, describeCostChange } from "@/lib/changeOrderCost";
import { FeatureHistoryDialog } from "@/components/materials/FeatureHistoryDialog";
import { TrueCostSummary } from "@/components/overhead/TrueCostCard";
import { averageLaborRate, burdenPerHour, looksLikeOverhead, lumpSumsWithoutHours, plannedManHours } from "@/lib/overhead";
import { MaterialAlertsBar } from "@/components/materials/MaterialAlertsBar";
import { markLinesOrdered } from "@/lib/materialAlertActions";
import { useMeasurementPrefill } from "@/hooks/use-measurement-prefill";
import { SmartSectionCalculatorDialog } from "@/components/materials/SmartSectionCalculatorDialog";
import { CatalogPicker } from "@/components/materials/CatalogPicker";
import { LogUsageDialog } from "@/components/materials/LogUsageDialog";
import { UsageLogHistoryDialog } from "@/components/materials/UsageLogHistoryDialog";
import { OrderSheetDialog } from "@/components/materials/OrderSheetDialog";
import { MaterialsLinePicker } from "@/components/common/MaterialsLinePicker";
import { findSmartSectionTemplate, type CalculatedLine } from "@/lib/smartSections";
import { nextOrderableQuantity } from "@/lib/catalogOrdering";
import {
  MATERIAL_UNITS,
  formatQty,
  materialLineLabel,
  materialsLineTotal,
  normalizeMaterialUnit,
  quantityWithWaste,
  wastePercentToReach,
  sortItemsByCost,
  type ItemSortMode,
} from "@/lib/materialsMath";
import { OptionOrCustomField } from "@/components/materials/OptionOrCustomField";
import { SectionTypeChip } from "@/components/common/SectionTypeChip";
import { SectionToolbarAction } from "@/components/common/SectionToolbarAction";
import { CostLineRow } from "@/components/materials/CostLineRow";
import { CompactLineRow } from "@/components/common/CompactLineRow";
import { SectionLaborBlock, type LaborDraft } from "@/components/materials/SectionLaborBlock";
import { AddLineSplitButton } from "@/components/materials/AddLineSplitButton";
import {
  COST_BUCKETS,
  COST_TYPE_GROUP_LABEL,
  COST_TYPE_SHORT_LABEL,
  LINE_COST_TYPES,
  LUMP_SUM_UNIT,
  costBreakdownLabel,
  costPlanTotal,
  groupLinesByType,
  laborFormula,
  lineCost,
  sectionTotals,
  sumSectionTotals,
  type LineCostType,
} from "@/lib/costPlanMath";
import type { SectionFeaturePicker } from "@/components/common/SectionNameField";
import {
  featureSectionSeeds,
  featureSeeds,
  featurePickerOptions,
  sectionFeatureOptions,
  withCommittedSectionName,
  withSectionType,
  type SectionFeatureOption,
} from "@/lib/sectionFeatures";
import {
  orderedQuantity,
  deliveredQuantity,
  usedQuantity,
  isProjectActive,
  revisedBaseline,
  lineStatus,
  hasAnyOrder,
  sheetCostSummary,
  materialAlerts,
  startContext,
  needsReconciliation,
  executionTrackedLines,
  trackingSummary,
  LINE_STATUS_LABEL,
  type LineStatus,
  type DeliveryLineWithOrderStatus,
} from "@/lib/materialTracking";
import { BackLink } from "@/components/common/BackLink";

const NONE = "__none__";
const NO_SECTIONS: MaterialsSection[] = [];

// ---------------------------------------------------------------------------
// Draft model — the whole sheet is edited locally and only written to
// Supabase when "Save changes" is pressed. New rows get a "tmp-" id.
// ---------------------------------------------------------------------------

interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  /** Optional cost category (Settings > Expense categories). Null = uncategorized. */
  expense_category_id: string | null;
  /** Legacy text category — now only a name snapshot of
   * material_category_id, written on save (see saveMut). */
  category: string | null;
  /** The line's one category (0094, Settings > Material categories).
   * Prefilled from the Catalog/Price Book source at pick time, never locked. */
  material_category_id: string | null;
  /** One of MATERIAL_UNITS or a custom unit (see UnitSelect). Not part of the math. */
  unit: string;
  /** Set when this line was picked from the Price Book — locks
   * expense_category_id in the UI. Null = a normal custom line (or a pick
   * that's since been unlinked). */
  price_book_item_id: string | null;
  /** Set when this line was picked from the Product Catalog instead — a
   * line is ever linked to at most one of price_book_item_id /
   * catalog_product_id, never both. */
  catalog_product_id: string | null;
  /** Waste allowance — required quantity = quantity × (1 + waste%), which
   * drives the line total and the suggested order quantity (materialsMath.ts). */
  waste_percent: number;
  /** Color (0093) — picked from the Catalog product's list or typed in.
   * Empty string = none. */
  color: string;
  /** Track / Don't Track (0086) — whether this line shows up in the live
   * Material Tracker once the sheet itself is tracked. Never affects the
   * quantity*unit_cost math (estimated/actual cost, Cost Plan) — see
   * materialTracking.ts's executionTrackedLines(). */
  tracked: boolean;
  /** Draft-only UI state, never persisted itself — when true, saving this
   * item also upserts its unit_cost into catalog_price_overrides. Reset to
   * false after every save. */
  rememberPrice: boolean;
  /** Cost plan line type (0103). Material lines keep everything above;
   * the rest are description + vendor + lump sum / qty × rate (CostLineRow). */
  cost_type: LineCostType;
  /** Vendor / sub for a non-material line. */
  vendor: string;
  /** "Looks like overhead" dismissed (0110) — written straight away, never
   * part of Save's diff. */
  overhead_warning_dismissed?: boolean;
  /** 0160 — added from this possible sub. Written on create only. */
  possible_sub_id?: string | null;
}
interface DraftSection extends LaborDraft {
  id: string;
  name: string;
  /** The cost plan's one project-wide section — pinned last, not deletable. */
  is_general: boolean;
  /** Set when this section was created via "Create Smart Section" — which
   * build type it is, so its header can show the calculator icon. Set
   * once at creation, never changes afterward. */
  smart_section_build_type: string | null;
  /** Project-type tag (0094) — one of the project's own Job Categories. */
  job_category_id: string | null;
  /** The project feature this section plans (0105). Null = General, or a
   * section from before features. */
  feature_id: string | null;
  /** Read-through of the feature's status — a proposed / removed feature's
   * section shows but never counts toward the plan total. */
  feature: { status: FeatureStatus; source_quote_id: string | null } | null;
  /** Picked "new feature of this type" — the feature is created on Save. */
  new_feature_category_id?: string | null;
  items: DraftItem[];
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const NO_LABOR: LaborDraft = {
  labor_mode: null,
  labor_crew_size: null,
  labor_days: null,
  labor_hours_per_day: null,
  labor_rate: null,
  labor_lump_sum: null,
  labor_man_hours: null,
  labor_notes: "",
};

/** A new blank line of a given type. Non-material lines start as a lump
 * sum (1 × amount). */
const blankDraftItem = (cost_type: LineCostType = "material", name = ""): DraftItem => ({
  id: tmpId(),
  name,
  quantity: cost_type === "material" ? 0 : 1,
  unit_cost: 0,
  expense_category_id: null,
  category: null,
  material_category_id: null,
  unit: cost_type === "material" ? "" : LUMP_SUM_UNIT,
  price_book_item_id: null,
  catalog_product_id: null,
  waste_percent: 0,
  color: "",
  tracked: cost_type === "material",
  rememberPrice: false,
  cost_type,
  vendor: "",
});

const blankDraftSection = (name: string, extra: Partial<DraftSection> = {}): DraftSection => ({
  id: tmpId(),
  name,
  is_general: false,
  smart_section_build_type: null,
  job_category_id: null,
  feature_id: null,
  feature: null,
  items: [],
  ...NO_LABOR,
  ...extra,
});

/** A new draft section from a feature seed — typed template lines with
 * blank quantity/price (how Smart Sections always start), plus the
 * template's labor default at the contractor's labor rate. */
const draftSectionFromSeed = (
  seed: {
    name: string;
    job_category_id: string | null;
    feature_id?: string | null;
    smart_section_build_type: string | null;
    items: { name: string; cost_type: LineCostType }[];
    labor?: { crew_size: number | null; days: number | null } | null;
  },
  laborRate: number,
): DraftSection =>
  blankDraftSection(seed.name, {
    smart_section_build_type: seed.smart_section_build_type,
    job_category_id: seed.job_category_id,
    feature_id: seed.feature_id ?? null,
    items: seed.items.map((i) => blankDraftItem(i.cost_type, i.name)),
    ...(seed.labor && (seed.labor.crew_size || seed.labor.days)
      ? {
          labor_mode: "crew" as const,
          labor_crew_size: seed.labor.crew_size,
          labor_days: seed.labor.days,
          labor_hours_per_day: 8,
          labor_rate: laborRate,
        }
      : {}),
  });

/**
 * The draft's invariants, applied after every edit: the General section is
 * always last (and there's exactly one), and each section's lines are
 * grouped by type — Materials, Subcontractors, Equipment, Other — keeping
 * their order within a group. Drag/drop and the up/down arrows work on
 * positions, so keeping the array itself in this shape keeps them right.
 */
const normalizeDraft = (sections: DraftSection[]): DraftSection[] => {
  const typeRank = (t: LineCostType) => LINE_COST_TYPES.indexOf(t);
  const grouped = sections.map((s) => {
    const items = s.items.map((it, i) => ({ it, i })).sort((a, b) => typeRank(a.it.cost_type) - typeRank(b.it.cost_type) || a.i - b.i);
    return items.every((x, i) => x.i === i) ? s : { ...s, items: items.map((x) => x.it) };
  });
  const general = grouped.filter((s) => s.is_general);
  const rest = grouped.filter((s) => !s.is_general);
  return [...rest, ...(general.length ? general.slice(0, 1) : [blankDraftSection("General", { is_general: true })])];
};

const laborOf = (s: MaterialsSection): LaborDraft => ({
  labor_mode: s.labor_mode ?? null,
  labor_crew_size: s.labor_crew_size == null ? null : Number(s.labor_crew_size),
  labor_days: s.labor_days == null ? null : Number(s.labor_days),
  labor_hours_per_day: s.labor_hours_per_day == null ? null : Number(s.labor_hours_per_day),
  labor_rate: s.labor_rate == null ? null : Number(s.labor_rate),
  labor_lump_sum: s.labor_lump_sum == null ? null : Number(s.labor_lump_sum),
  labor_man_hours: s.labor_man_hours == null ? null : Number(s.labor_man_hours),
  labor_notes: s.labor_notes ?? "",
});

/** Cost sort applied inside each type group — groups stay Materials,
 * Subcontractors, Equipment, Other. */
const sortWithinTypeGroups = (items: DraftItem[], mode: ItemSortMode): DraftItem[] =>
  groupLinesByType(items).flatMap((g) => sortItemsByCost(g.lines, mode));

const laborChanged = (a: LaborDraft, b: LaborDraft) =>
  (Object.keys(NO_LABOR) as (keyof LaborDraft)[]).some((k) => (a[k] ?? null) !== (b[k] ?? null));

const seed = (sections: MaterialsSection[]): DraftSection[] =>
  normalizeDraft(sections.map((s) => ({
    id: s.id,
    name: s.name,
    is_general: !!s.is_general,
    smart_section_build_type: s.smart_section_build_type ?? null,
    job_category_id: s.job_category_id ?? null,
    feature_id: s.feature_id ?? null,
    feature: s.feature ?? null,
    ...laborOf(s),
    items: s.materials_items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
      expense_category_id: i.expense_category_id ?? null,
      category: i.category ?? null,
      material_category_id: i.material_category_id ?? null,
      unit: i.unit ?? "",
      price_book_item_id: i.price_book_item_id ?? null,
      catalog_product_id: i.catalog_product_id ?? null,
      waste_percent: Number(i.waste_percent ?? 0),
      color: i.color ?? "",
      tracked: i.tracked ?? true,
      rememberPrice: false,
      cost_type: i.cost_type ?? "material",
      vendor: i.vendor ?? "",
      overhead_warning_dismissed: i.overhead_warning_dismissed ?? false,
      possible_sub_id: i.possible_sub_id ?? null,
    })),
  })));

const itemChanged = (
  a: DraftItem,
  b: {
    name: string;
    quantity: number;
    unit_cost: number;
    expense_category_id: string | null;
    category: string | null;
    material_category_id: string | null;
    unit: string;
    price_book_item_id: string | null;
    catalog_product_id: string | null;
    waste_percent: number;
    color: string;
    tracked: boolean;
    cost_type: LineCostType;
    vendor: string;
  },
) =>
  a.name !== b.name ||
  a.quantity !== b.quantity ||
  a.unit_cost !== b.unit_cost ||
  a.expense_category_id !== b.expense_category_id ||
  a.category !== b.category ||
  a.material_category_id !== b.material_category_id ||
  a.unit !== b.unit ||
  a.price_book_item_id !== b.price_book_item_id ||
  a.catalog_product_id !== b.catalog_product_id ||
  a.waste_percent !== b.waste_percent ||
  a.color !== b.color ||
  a.tracked !== b.tracked ||
  a.cost_type !== b.cost_type ||
  a.vendor !== b.vendor;

/**
 * Route entry for /projects/:id/materials — the project's one Cost plan
 * (0106). With no plan yet it opens straight into an unsaved draft with a
 * section per project feature; Save creates it.
 */
export function ProjectMaterialsView() {
  const { id = "" } = useParams();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["materials-sheets", { project: id }],
    queryFn: () => listMaterialsSheets(id),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading cost plan…</p>;

  return (
    <MaterialsSheetBuilder
      projectId={id}
      projectName={project?.name}
      sheetId={sheets[0]?.id}
      backHref={`/projects/${id}`}
      backLabel="Back to project"
    />
  );
}

/** Old links to /projects/:id/materials/:sheetId land on the same builder. */
export function ProjectMaterialsSheetDetailView() {
  const { id = "", sheetId = "" } = useParams();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });

  return (
    <MaterialsSheetBuilder
      projectId={id}
      projectName={project?.name}
      sheetId={sheetId}
      backHref={`/projects/${id}`}
      backLabel="Back to project"
    />
  );
}

interface MaterialsSheetBuilderProps {
  projectId: string;
  projectName: string | undefined;
  /** Undefined = this project has no materials sheet yet — a brand-new
   * sheet is created lazily the first time "Save changes" runs, exactly
   * like a brand-new quote/section/item's tmp- id resolves on save. */
  sheetId: string | undefined;
  backHref: string;
  backLabel: string;
}

function MaterialsSheetBuilder({ projectId, projectName, sheetId, backHref, backLabel }: MaterialsSheetBuilderProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // A stable empty default — a fresh [] per render would re-fire the
  // draft-seeding effect below on every render while this loads (or
  // forever, for a project with no plan yet).
  const { data: sections = NO_SECTIONS, isLoading, isError, error } = useQuery({
    queryKey: ["materials", { sheet: sheetId }],
    queryFn: () => listMaterialsBySheet(sheetId!),
    enabled: !!sheetId,
    refetchOnWindowFocus: false,
  });
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });
  const { data: priceBookItems = [] } = useQuery({
    queryKey: ["price-book"],
    queryFn: listPriceBookItems,
  });
  const { data: catalogItems = [] } = useQuery({
    queryKey: ["product-catalog"],
    queryFn: listProductCatalog,
  });
  const { data: priceOverrides = [] } = useQuery({
    queryKey: ["catalog-price-overrides"],
    queryFn: listCatalogPriceOverrides,
  });

  // Material budget tracking (0080) — the Material Tracker shows on every
  // sheet with at least one line, regardless of quote/CO approval or
  // project status. "Estimated" uses effectiveEstimate() (materialTracking.ts):
  // the locked baseline once one's been snapshotted (post-Won), else the
  // line's own live quantity/cost, so a project still in Estimating shows
  // a real number instead of $0.
  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId) });
  // The contractor's labor rate (Settings › Business profile) — what a new
  // section's labor block starts at.
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const laborRate = businessProfile?.default_labor_rate ?? 45;
  // Material categories (0094) — the line items' one category list.
  const { data: materialCategories = [] } = useQuery({
    queryKey: ["material-categories"],
    queryFn: listMaterialCategories,
  });
  // Section project-type tags — options are the project's own Project
  // types, so changing those on the project changes what's offered here.
  const { data: jobCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const projectTypeOptions = useMemo(() => {
    const ids = new Set(project ? projectCategoryIds(project) : []);
    return jobCategories.filter((c) => ids.has(c.id));
  }, [project, jobCategories]);
  // Per-section item sort (view-only until the user reorders — see
  // reorderFromSorted).
  const [itemSort, setItemSort] = useState<Record<string, ItemSortMode>>({});
  const sortOf = (sid: string): ItemSortMode => itemSort[sid] ?? "manual";
  const { data: projectChangeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: projectId }],
    queryFn: () => listChangeOrders(projectId),
  });
  const { data: materialOrders = [] } = useQuery({
    queryKey: ["material-orders", { project: projectId }],
    queryFn: () => listMaterialOrders(projectId),
  });
  const deliveries: DeliveryLineWithOrderStatus[] = materialOrders.flatMap((o) =>
    o.material_order_items.map((item) => ({ item, orderStatus: o.status })),
  );
  // Tracking, deliveries and the order sheet are about MATERIAL lines only.
  // …and only lines that count: never a proposed add-on's or removed feature's.
  const trackedLines: MaterialsItem[] = sections
    .filter(countsTowardTotals)
    .flatMap((s) => s.materials_items)
    .filter((i) => (i.cost_type ?? "material") === "material");
  const isTracked = trackedLines.length > 0;
  const trackedLineIds = trackedLines.map((l) => l.id);
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", trackedLineIds],
    queryFn: () => listUsageLogsForItems(trackedLineIds),
    enabled: trackedLineIds.length > 0,
  });
  // Tracking only applies once the job is actually happening (Won and
  // scheduled / in progress / complete) — isProjectActive, the one rule for
  // every tracking-related piece of this screen. Before that the sheet is a
  // plain estimate: no panels, no Tracked toggles, no summary card.
  const trackingActive = isProjectActive(project);
  const costSummary = trackingActive && isTracked ? sheetCostSummary(trackedLines, deliveries, usageLogs) : null;
  // The same material alerts the project page shows (one story), with the
  // same quick actions.
  const materialAlertList =
    trackingActive && project && businessProfile
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
  const alertSectionNames = new Map(sections.map((sec) => [sec.id, sec.name]));

  // Per tracked line: what's been ordered/delivered/used, plus an explicit
  // "Revise estimate" if there is one. Est. itself is worked out live in
  // each row from the draft quantity + waste (see ItemRow).
  const trackingByItemId = useMemo(() => {
    const map: TrackingContext["byItemId"] = new Map();
    if (!trackingActive) return map;
    for (const line of executionTrackedLines(trackedLines)) {
      map.set(line.id, {
        revisedQuantity: revisedBaseline(line)?.quantity ?? null,
        ordered: orderedQuantity(line, deliveries),
        delivered: deliveredQuantity(line, deliveries),
        used: usedQuantity(line, usageLogs),
        unit: line.unit,
        hasOrder: hasAnyOrder(line, deliveries),
      });
    }
    return map;
  }, [trackingActive, trackedLines, deliveries, usageLogs]);

  const [logUsageLine, setLogUsageLine] = useState<MaterialsItem | null>(null);

  const markFullyUsedMut = useMutation({
    mutationFn: (line: MaterialsItem) => {
      const delivered = deliveredQuantity(line, deliveries);
      const used = usedQuantity(line, usageLogs);
      const remaining = Math.max(0, delivered - used);
      return addUsageLog({ materials_item_id: line.id, quantity: remaining, note: "Marked fully used" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials-usage-logs"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const [reviseTarget, setReviseTarget] = useState<MaterialsItem | null>(null);
  const [reviseReason, setReviseReason] = useState("");
  const reviseMut = useMutation({
    mutationFn: () => reviseMaterialBaseline(reviseTarget!.id, reviseReason.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Estimate revised" });
      setReviseTarget(null);
      setReviseReason("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const [draft, setDraft] = useState<DraftSection[]>([]);
  const [smartSectionOpen, setSmartSectionOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const dirty = useRef(false);

  // Seed the draft from the server — but never clobber unsaved edits. Save
  // only deletes server sections that were in the draft when it was seeded,
  // so a section created meanwhile (another tab, a new feature) survives.
  const seededSectionIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(sections));
    seededSectionIds.current = new Set(sections.map((s) => s.id));
  }, [sections]);

  const markDirty = () => {
    dirty.current = true;
  };
  // Every edit keeps the draft's shape: General last, lines grouped by type.
  const edit = (fn: (d: DraftSection[]) => DraftSection[]) => {
    markDirty();
    setDraft((d) => normalizeDraft(fn(d)));
  };
  const { moveSection, moveItem: moveItemRaw, onDragEnd: onDragEndRaw } = useSectionReorder<DraftItem, DraftSection>(edit);
  // Reordering an item while its section is sorted by cost: the sorted
  // order becomes the new manual order first, then the move applies on top
  // and the section switches back to Manual. Sorting alone never touches
  // the saved order.
  const reorderFromSorted = (sectionIds: string[]) => {
    const sorted = sectionIds.filter((sid) => sortOf(sid) !== "manual");
    if (sorted.length === 0) return;
    edit((d) => d.map((s) => (sorted.includes(s.id) ? { ...s, items: sortWithinTypeGroups(s.items, sortOf(s.id)) } : s)));
    setItemSort((prev) => ({ ...prev, ...Object.fromEntries(sorted.map((sid) => [sid, "manual" as const])) }));
  };
  const moveItem = (sid: string, index: number, direction: -1 | 1) => {
    reorderFromSorted([sid]);
    moveItemRaw(sid, index, direction);
  };
  const onDragEnd = (result: DropResult) => {
    if (result.type === "item" && result.destination) {
      reorderFromSorted([result.source.droppableId, result.destination.droppableId]);
    }
    onDragEndRaw(result);
  };
  const {
    isCollapsed,
    toggle: toggleCollapse,
    expand: expandSection,
    collapseAll,
    expandAll,
  } = useSectionCollapse();
  // Just the line items (header + toolbar stay) — its own remembered state.
  const itemsCollapse = useSectionCollapse({ storageKey: "chq_items_collapse_v1", defaultCollapsed: () => false });
  // Tracked only so a collapsed section's header knows to auto-expand on
  // hover while a line item is being dragged over it — collapsing hides the
  // item Droppable's visible content but keeps it mounted (see SectionCard).
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  const discard = () => {
    dirty.current = false;
    setDraft(seed(sections));
    seededSectionIds.current = new Set(sections.map((s) => s.id));
  };

  // --- material alert quick actions ------------------------------------------
  const markOrderedMut = useMutation({
    mutationFn: (lineIds: string[]) => markLinesOrdered(projectId, trackedLines.filter((l) => lineIds.includes(l.id))),
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
      toast({ title: "Won't alert for that line", description: "Tracking is off for it — turn it back on with its Tracked toggle." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  // Mid-edit, "not needed" goes into the draft (Save applies it) so a later
  // Save can't flip it back; otherwise it's written straight away.
  const markNotNeeded = (lineId: string) => {
    if (dirty.current) {
      edit((d) => d.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.id === lineId ? { ...i, tracked: false } : i)) })));
      toast({ title: "Tracking off for that line", description: "Save changes to apply." });
    } else {
      notNeededMut.mutate(lineId);
    }
  };

  // Links from the alerts (…/materials#line-<id> or #section-<id>): open
  // the section, scroll to it and flash the row.
  const location = useLocation();
  const handledHash = useRef("");
  useEffect(() => {
    const m = location.hash.match(/^#(line|section)-(.+)$/);
    if (!m || draft.length === 0 || handledHash.current === location.hash) return;
    const [, kind, targetId] = m;
    const sec = kind === "section" ? draft.find((x) => x.id === targetId) : draft.find((x) => x.items.some((i) => i.id === targetId));
    if (!sec) return;
    handledHash.current = location.hash;
    expandSection(sec.id);
    // Scroll once the section has opened, then again after late-loading
    // panels above it settle (they'd otherwise push the row back off screen).
    const reveal = (flash: boolean) => {
      const el = document.getElementById(`${kind}-${targetId}`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (flash || r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center" });
      if (flash) {
        el.classList.add("ring-2", "ring-warning-strong", "ring-offset-2");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-warning-strong", "ring-offset-2"), 2400);
      }
    };
    window.setTimeout(() => reveal(true), 200);
    window.setTimeout(() => reveal(false), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, draft.length]);

  // --- local mutators -------------------------------------------------------
  const renameSection = (sid: string, name: string) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, name } : s)));
  const deleteSection = (sid: string) => edit((d) => d.filter((s) => s.id !== sid));
  // The type chip: the name follows the new type while it's still the
  // autofilled one (see withSectionType); a hand-typed name is left alone.
  const setSectionType = (sid: string, job_category_id: string | null) =>
    edit((d) => d.map((s) => (s.id === sid ? withSectionType(s, job_category_id, jobCategories) : s)));
  // The name field's feature picker: name + type (+ feature) in one step.
  // An existing feature → the section plans it; "new feature of a type" →
  // created on Save; a bare build type → just the name.
  const pickSectionFeature = (sid: string, o: SectionFeatureOption) =>
    edit((d) =>
      d.map((s) => {
        if (s.id !== sid) return s;
        const typeName = jobCategories.find((c) => c.id === o.categoryId)?.name;
        return {
          ...s,
          name: o.newFeature ? (typeName ?? o.label) : o.label,
          job_category_id: o.categoryId ?? s.job_category_id,
          ...(o.featureId
            ? { feature_id: o.featureId, feature: featureStatusOf(o.featureId), new_feature_category_id: null }
            : o.newFeature
              ? { feature_id: null, feature: null, new_feature_category_id: o.categoryId }
              : {}),
        };
      }),
    );
  // Typed name committed: an untyped section whose name matches a feature
  // gets that type. Only touches the draft when something changes.
  const commitSectionName = (sid: string) => {
    const section = draft.find((s) => s.id === sid);
    if (!section) return;
    const next = withCommittedSectionName(section, projectTypeOptions, jobCategories);
    if (next !== section) edit((d) => d.map((s) => (s.id === sid ? next : s)));
  };
  // Features (0105): the project's things being built. Before 0105 the
  // list is empty and the picker falls back to project types.
  // Possible subcontracted work spotted at the site visit (0155) — offered
  // as one-tap Subcontractor lines on the matching section.
  const { data: opportunity } = useQuery({
    queryKey: ["opportunity-by-project", projectId],
    queryFn: () => getOpportunityByProjectId(projectId),
  });
  const { data: features = [], isSuccess: featuresLoaded } = useQuery({
    queryKey: ["project-features", projectId],
    queryFn: () => listProjectFeatures(projectId),
  });
  const hasFeatures = features.length > 0;
  // Phase C/D: pending change orders' cost changes (the overlay), each
  // feature's history, and the quotes behind add-on labels and prices.
  const { data: pendingCostChanges = [] } = useQuery({
    queryKey: ["pending-cost-changes", projectId],
    queryFn: () => listPendingCostChanges(projectId),
  });
  const { data: featureHistory = [] } = useQuery({
    queryKey: ["feature-history", projectId],
    queryFn: () => listFeatureHistory(projectId),
  });
  const { data: projectQuotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId),
  });
  const coNumbers = useMemo(() => changeOrderNumbers(projectChangeOrders), [projectChangeOrders]);
  const addonNumbers = useMemo(() => addonQuoteNumbers(projectQuotes), [projectQuotes]);
  const pendingFor = (featureId: string | null) => {
    if (!featureId) return [];
    const byCo = new Map<string, typeof pendingCostChanges>();
    for (const c of pendingCostChanges) {
      if (c.feature_id !== featureId) continue;
      byCo.set(c.change_order_id, [...(byCo.get(c.change_order_id) ?? []), c]);
    }
    return [...byCo.entries()].map(([coId, list]) => ({
      label: `CO #${coNumbers.get(coId) ?? "?"}`,
      delta: list.reduce((sum, c) => sum + costChangeDelta(c), 0),
      lines: list.map((c) => describeCostChange(c)),
    }));
  };
  const [historyFeatureId, setHistoryFeatureId] = useState<string | null>(null);

  // True cost (0110): the job's rate is what it was sold with (project),
  // else what its quote stores, else the current settings.
  const { data: overheadSettings } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });
  const headlineForPlan = pickHeadlineQuote(projectQuotes);
  const planOverheadRate =
    project?.overhead_rate != null
      ? Number(project.overhead_rate)
      : headlineForPlan?.overhead_rate != null
        ? Number(headlineForPlan.overhead_rate)
        : burdenPerHour(overheadSettings);
  const contractForPlan = projectContractValue(projectQuotes, projectChangeOrders);
  const planPrice = contractForPlan > 0 ? contractForPlan : null;
  // The price already counts the client's picks; their cost joins the plan
  // only on approval — count it here until then (pendingSelectionsCost).
  const planPendingSelections = pendingSelectionsCost(headlineForPlan);
  const planTargetMargin = project?.target_margin_pct ?? headlineForPlan?.target_margin_pct ?? overheadSettings?.target_margin_pct ?? null;
  // Hide it now (without making the draft dirty), and remember it on the
  // line if it's saved.
  const dismissOverheadWarning = (itemId: string) => {
    setDraft((d) => d.map((sec) => ({ ...sec, items: sec.items.map((i) => (i.id === itemId ? { ...i, overhead_warning_dismissed: true } : i)) })));
    if (!isTmp(itemId)) void updateMaterialsItem(itemId, { overhead_warning_dismissed: true }).catch(() => undefined);
  };

  // Phase E: once the job is Won, each feature section shows planned vs
  // actual (spend + labor tagged with the feature; reconciled materials
  // under the same Complete gate as the project page).
  const { data: projectExpenses = [] } = useQuery({
    queryKey: ["expenses", { project: projectId }],
    queryFn: () => listExpenses(projectId),
    enabled: trackingActive,
  });
  const { data: laborEntries = [] } = useQuery({
    queryKey: ["labor-entries", { project: projectId }],
    queryFn: () => listLaborEntries(projectId),
    enabled: trackingActive,
  });
  const reportsByFeature = useMemo(() => {
    if (!trackingActive || !features.some((f) => f.status === "active")) return new Map<string | null, ReturnType<typeof featureReports>[number]>();
    const reconciled = project?.status === "complete" && trackedLines.length > 0 && needsReconciliation(trackedLines, deliveries, usageLogs).length === 0;
    const materialActual = reconciled
      ? sections.filter(countsTowardTotals).reduce((m, sec) => {
          const lines = sec.materials_items.filter((i) => (i.cost_type ?? "material") === "material");
          m.set(sec.feature_id ?? null, (m.get(sec.feature_id ?? null) ?? 0) + sheetCostSummary(lines, deliveries, usageLogs).actualCost);
          return m;
        }, new Map<string | null, number>())
      : undefined;
    const rows = featureReports({
      features,
      categories: jobCategories,
      sections,
      quotes: projectQuotes,
      changeOrders: projectChangeOrders,
      expenses: projectExpenses,
      expenseCategories,
      laborEntries,
      materialActual,
      materialPending: !materialActual,
    });
    return new Map(rows.map((r) => [r.featureId, r]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingActive, features, sections, projectQuotes, projectChangeOrders, projectExpenses, laborEntries, expenseCategories, jobCategories, usageLogs, materialOrders]);
  const featureStatusOf = (fid: string) => {
    const f = features.find((x) => x.id === fid);
    return f ? { status: f.status, source_quote_id: f.source_quote_id } : null;
  };
  const typeOptions = useMemo(() => sectionFeatureOptions(projectTypeOptions, jobCategories), [projectTypeOptions, jobCategories]);
  const pickerOptionsFor = (sid: string) =>
    hasFeatures
      ? featurePickerOptions(
          features,
          jobCategories,
          new Set(draft.filter((s) => s.id !== sid && s.feature_id).map((s) => s.feature_id!)),
        )
      : typeOptions;
  // "Add blank section" opens the new section's picker straight away.
  const [autoOpenSectionId, setAutoOpenSectionId] = useState<string | null>(null);
  const addSection = () => {
    const id = tmpId();
    edit((d) => [...d, { ...blankDraftSection(""), id }]);
    setAutoOpenSectionId(id);
  };
  const featurePickerFor = (sid: string): SectionFeaturePicker => ({
    ...pickerOptionsFor(sid),
    usedCategoryIds: hasFeatures
      ? new Set<string>()
      : new Set(draft.filter((s) => s.id !== sid && s.job_category_id).map((s) => s.job_category_id!)),
    onPick: (o) => pickSectionFeature(sid, o),
    onCommit: () => commitSectionName(sid),
    autoOpen: autoOpenSectionId === sid,
    onAutoOpened: () => setAutoOpenSectionId(null),
  });
  // Step 1 of Smart Section is a template, not a calculator: it lands as
  // an ordinary new draft section with blank-quantity/price line items
  // named per the build type. Indistinguishable from manually-added rows
  // from this point on, so everything below (edit, delete, add more rows,
  // Save) treats it exactly the same. The build type is remembered on the
  // section so its header can show the calculator icon (step 2).
  const addSmartSection = (
    buildTypeId: string,
    name: string,
    lineItems: { name: string; cost_type: LineCostType }[],
    labor: { crew_size: number | null; days: number | null } | null,
  ) =>
    edit((d) => [
      ...d,
      draftSectionFromSeed(
        {
          name,
          smart_section_build_type: buildTypeId,
          // Auto-tag with the project type matching this build type
          // (e.g. "Paver Patio"), when the project has one.
          job_category_id: matchProjectTypeForBuildType(buildTypeId, projectTypeOptions),
          items: lineItems,
          labor,
        },
        laborRate,
      ),
    ]);

  // --- one section per project feature (sectionFeatures.featureSectionSeeds)
  const { data: smartSettings = [], isSuccess: smartSettingsLoaded } = useQuery({
    queryKey: ["smart-section-settings"],
    queryFn: listSmartSectionSettings,
  });
  const projectTypeIds = useMemo(() => (project ? projectCategoryIds(project) : []), [project]);
  // A project with no plan yet opens straight into this builder: start the
  // (unsaved) draft with one section per project feature (per project type
  // before 0105), once. Discard empties it; Save creates the plan.
  const prefilled = useRef(false);
  useEffect(() => {
    if (sheetId || prefilled.current || dirty.current || !project || !smartSettingsLoaded || !featuresLoaded || jobCategories.length === 0)
      return;
    prefilled.current = true;
    const seeds = hasFeatures
      ? featureSeeds(groupByType(liveFeatures(features), (f) => f.category_id), jobCategories, smartSettings)
      : featureSectionSeeds(projectTypeIds, jobCategories, smartSettings);
    if (seeds.length > 0) {
      edit(() =>
        seeds.map((sd) => ({
          ...draftSectionFromSeed(sd, laborRate),
          feature: sd.feature_id ? featureStatusOf(sd.feature_id) : null,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, project, smartSettingsLoaded, featuresLoaded, jobCategories]);

  // One section per feature, automatically: a feature added since the plan
  // was made (Project types, "+ Add another" on measurements…) gets its
  // section written straight away. Only while nothing's unsaved, so the new
  // section can't collide with an open draft.
  const ensuringFor = useRef("");
  useEffect(() => {
    if (!sheetId || dirty.current || isLoading) return;
    const covered = new Set(sections.map((sec) => sec.feature_id).filter(Boolean));
    const missing = liveFeatures(features).filter((f) => !covered.has(f.id)).map((f) => f.id).join(",");
    if (!missing || ensuringFor.current === missing) return;
    ensuringFor.current = missing;
    ensureFeatureSections(projectId)
      .then((n) => n > 0 && qc.invalidateQueries({ queryKey: ["materials"] }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, isLoading, sections, features]);
  // Step 2 — the calculator writes quantities into the section's existing
  // line items, matched purely by name against the build type's fixed
  // template (never by position). A line the calculator doesn't return
  // (deleted by the user, or an optional line not applicable this run) is
  // left untouched; a custom line the user added outside the template
  // never matches any calculated line, so it's left alone too.
  const applyCalculatedLines = (sid: string, lines: CalculatedLine[], inputs?: Record<string, unknown>) => {
    // What the calculator was given (0114) — saved straight onto the
    // section (it's metadata for closeouts / similar-job matching, not part
    // of the draft); a brand-new unsaved section keeps none.
    if (inputs && !isTmp(sid)) void updateMaterialsSection(sid, { smart_inputs: inputs }).catch(() => undefined);
    return applyCalculatedLinesToDraft(sid, lines);
  };
  const applyCalculatedLinesToDraft = (sid: string, lines: CalculatedLine[]) =>
    edit((d) =>
      d.map((s) => {
        if (s.id !== sid) return s;
        // Measured add-ons (backsplash, backrest caps, strip lighting) the
        // section doesn't have a line for yet get one.
        const missing = lines
          .filter((l) => l.addIfMissing && !s.items.some((item) => item.name === l.name))
          .map((l) => blankDraftItem("material", l.name));
        return {
          ...s,
          items: [...s.items, ...missing].map((item) => {
            const line = lines.find((l) => l.name === item.name);
            if (!line) return item;
            const patch: Partial<DraftItem> = {
              quantity: line.quantity,
              unit: normalizeMaterialUnit(line.unit),
              ...(line.wastePercent != null ? { waste_percent: line.wastePercent } : {}),
            };
            if (line.catalogProduct !== undefined) {
              const product = line.catalogProduct;
              patch.catalog_product_id = product?.id ?? null;
              patch.price_book_item_id = null;
              // Seed unit_cost from a remembered price only when this line
              // hasn't been priced yet — re-running never clobbers a price
              // the contractor already typed in.
              if (product && item.unit_cost === 0) {
                const override = priceOverrides.find((o) => o.catalog_product_id === product.id);
                if (override) patch.unit_cost = override.price;
              }
              // Same never-clobber rule for the Order Sheet category —
              // inherits the Catalog product's category only while unset.
              if (product && item.material_category_id == null) {
                patch.material_category_id = materialCategoryIdByName(materialCategories, product.category);
              }
            }
            return { ...item, ...patch };
          }),
        };
      }),
    );
  // A new line of the given type — lands at the end of its type's group.
  const addItem = (sid: string, type: LineCostType = "material") =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, items: [...s.items, blankDraftItem(type)] } : s)));
  const editLabor = (sid: string, patch: Partial<LaborDraft>) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const editItem = (sid: string, iid: string, patch: Partial<DraftItem>) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? { ...s, items: s.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }
          : s,
      ),
    );
  const deleteItem = (sid: string, iid: string) =>
    edit((d) =>
      d.map((s) => (s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== iid) } : s)),
    );

  // --- save (diff draft against the server data) --------------------------
  // Rows (and the sheet) a save has created so far — so a save that fails
  // partway doesn't create them again on the next try (remapDraftIds).
  const createdIds = useRef(new Map<string, string>());
  const createdSheetId = useRef<string | null>(null);
  const saveMut = useMutation({
    mutationFn: async () => {
      createdIds.current = new Map();
      // No sheet exists yet (brand-new project) — create it lazily, exactly
      // like a brand-new section/item's tmp- id resolves to a real row here.
      if (!sheetId && !createdSheetId.current)
        createdSheetId.current = (await createMaterialsSheet(projectId, { name: "Cost plan", feature_category_ids: projectTypeIds })).id;
      const currentSheetId = sheetId ?? createdSheetId.current!;

      const serverSections = new Map(sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.map((s) => s.id));
      const draftFeatureIds = new Set(draft.map((s) => s.feature_id).filter(Boolean));

      // 0. features picked as "new <type>" are created first
      for (const ds of draft) {
        if (ds.feature_id || !ds.new_feature_category_id) continue;
        try {
          const f = await createProjectFeature(projectId, { category_id: ds.new_feature_category_id });
          ds.feature_id = f.id;
        } catch {
          // before 0105: the section just keeps its type
        }
      }

      // 1. deletes — server sections no longer in the draft (cascades their
      //    items). A deleted feature section takes its feature out of the
      //    project (marked removed, not deleted) unless another section
      //    still plans it — otherwise it would just be recreated.
      for (const s of sections) {
        if (draftSectionIds.has(s.id) || !seededSectionIds.current.has(s.id)) continue;
        await deleteMaterialsSection(s.id);
        if (s.feature_id && !draftFeatureIds.has(s.feature_id) && s.feature?.status === "active") {
          await updateProjectFeature(s.feature_id, { status: "removed" });
        }
      }

      // 2. per section: create / rename, then its items
      for (let si = 0; si < draft.length; si++) {
        const ds = draft[si];
        const name = ds.name.trim() || (ds.is_general ? "General" : "New section");
        const labor = {
          labor_mode: ds.labor_mode,
          labor_crew_size: ds.labor_crew_size,
          labor_days: ds.labor_days,
          labor_hours_per_day: ds.labor_hours_per_day,
          labor_rate: ds.labor_rate,
          labor_lump_sum: ds.labor_lump_sum,
          labor_notes: ds.labor_notes.trim() || null,
          // only sent when set, so saving still works before 0110
          ...(ds.labor_man_hours != null || (serverSections.get(ds.id)?.labor_man_hours ?? null) != null
            ? { labor_man_hours: ds.labor_man_hours ?? null }
            : {}),
        };
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await createMaterialsSection(projectId, currentSheetId, {
            name,
            sort_order: si,
            smart_section_build_type: ds.smart_section_build_type,
            job_category_id: ds.job_category_id,
            is_general: ds.is_general,
            feature_id: ds.feature_id,
            ...(ds.labor_mode ? labor : {}),
          });
          sectionId = created.id;
          createdIds.current.set(ds.id, created.id);
        } else if (server.name !== name || server.sort_order !== si) {
          await updateMaterialsSection(server.id, { name, sort_order: si });
        }
        if (server && (server.job_category_id ?? null) !== ds.job_category_id) {
          await updateMaterialsSection(server.id, { job_category_id: ds.job_category_id });
        }
        if (server && (server.feature_id ?? null) !== ds.feature_id) {
          await updateMaterialsSection(server.id, { feature_id: ds.feature_id });
        }
        if (server && laborChanged(ds, laborOf(server))) {
          await updateMaterialsSection(server.id, labor);
        }

        const serverItems = new Map((server?.materials_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        // 2a. item deletes (skip if the section itself is new — nothing to delete)
        if (server) {
          for (const i of server.materials_items) {
            if (!draftItemIds.has(i.id)) await deleteMaterialsItem(i.id);
          }
        }

        // 2b. item creates / updates
        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const srv = serverItems.get(di.id);
          const unit = di.unit.trim() || null;
          // Text category = a name snapshot of the chosen material
          // category. Before 0094 (no categories loaded) keep the old value.
          const categoryText = materialCategories.length
            ? (materialCategories.find((c) => c.id === di.material_category_id)?.name ?? null)
            : di.category;
          if (!srv) {
            const createdItem = await addMaterialsItem(sectionId, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              sort_order: ii,
              expense_category_id: di.expense_category_id,
              category: categoryText,
              material_category_id: di.material_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
              color: di.color.trim() || null,
              tracked: di.tracked,
              cost_type: di.cost_type,
              vendor: di.vendor.trim() || null,
              possible_sub_id: di.possible_sub_id ?? null,
            });
            createdIds.current.set(di.id, createdItem.id);
          } else if (
            itemChanged(di, {
              name: srv.name,
              quantity: Number(srv.quantity),
              unit_cost: Number(srv.unit_cost),
              expense_category_id: srv.expense_category_id ?? null,
              category: srv.category ?? null,
              material_category_id: srv.material_category_id ?? null,
              unit: srv.unit ?? "",
              price_book_item_id: srv.price_book_item_id ?? null,
              catalog_product_id: srv.catalog_product_id ?? null,
              waste_percent: Number(srv.waste_percent ?? 0),
              color: srv.color ?? "",
              tracked: srv.tracked ?? true,
              cost_type: srv.cost_type ?? "material",
              vendor: srv.vendor ?? "",
            }) ||
            srv.sort_order !== ii
          ) {
            await updateMaterialsItem(srv.id, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              expense_category_id: di.expense_category_id,
              category: categoryText,
              material_category_id: di.material_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
              color: di.color.trim() || null,
              tracked: di.tracked,
              cost_type: di.cost_type,
              vendor: di.vendor.trim() || null,
              sort_order: ii,
            });
          }

          // "Remember this price for next time" — a draft-only toggle, saved
          // as a per-user override keyed to the catalog product, independent
          // of this specific materials_item row.
          if (di.rememberPrice && di.catalog_product_id) {
            await upsertCatalogPriceOverride(di.catalog_product_id, di.unit_cost);
          }
        }
      }
    },
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["project-features", projectId] });
      qc.invalidateQueries({ queryKey: ["materials", { sheet: sheetId }] });
      qc.invalidateQueries({ queryKey: ["materials", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["catalog-price-overrides"] });
      toast({ title: "Cost plan saved" });
    },
    onError: (err: Error) => {
      // Keep what did save: its rows get their real ids, and the server copy
      // is refreshed, so the next Save updates them instead of re-creating them.
      if (createdIds.current.size) {
        const created = createdIds.current;
        edit((d) => remapDraftIds(d, created));
      }
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      toast({ title: "Couldn't finish saving", description: `${err.message} — what saved is kept; Save again to finish.`, variant: "destructive" });
    },
  });

  // The Total cost card: every section, broken down by cost type.
  const planTotals = useMemo(() => sumSectionTotals(draft), [draft]);

  // Track / Don't Track (0086) — live off the draft (not the server rows)
  // so the count updates the instant the contractor toggles an item, same
  // as every other field on this page.
  const draftItems = useMemo(() => draft.flatMap((s) => s.items).filter((i) => i.cost_type === "material"), [draft]);
  const itemTrackingSummary = useMemo(() => trackingSummary(draftItems), [draftItems]);
  const setAllTracked = (tracked: boolean) =>
    edit((d) => d.map((s) => ({ ...s, items: s.items.map((i) => (i.cost_type === "material" ? { ...i, tracked } : i)) })));

  const { data: possibleSubs = [] } = useQuery({
    queryKey: possibleSubsKey(opportunity?.id ?? ""),
    queryFn: () => listPossibleSubs(opportunity!.id),
    enabled: !!opportunity?.id,
  });
  const jobCategoryIdsLive = liveFeatures(features)
    .map((f) => f.category_id)
    .filter((c): c is string => !!c);
  const categoryName = (id: string) => jobCategories.find((c) => c.id === id)?.name ?? "";
  // Each sub is suggested once (placeSubSuggestions): its first linked
  // section in plan order, else General; gone once any line comes from it.
  const subPlanSections: SubPlanSection[] = draft.map((section) => {
    const feature = section.feature_id ? features.find((f) => f.id === section.feature_id) : undefined;
    return {
      id: section.id,
      categoryId: feature?.category_id ?? section.job_category_id ?? null,
      isGeneral: section.is_general,
      lineNames: section.items.map((i) => i.name.split(" — ")[0]),
      subIds: section.items.map((i) => i.possible_sub_id ?? null),
    };
  });
  const subSuggestions = placeSubSuggestions(possibleSubs, subPlanSections, jobCategoryIdsLive);
  const [addingSub, setAddingSub] = useState<SubSuggestion | null>(null);
  const subLineName = (name: string, note: string | null) => (note ? `${name} — ${note}` : name);
  /** Appends subcontractor lines (section id → lines) to the draft. */
  const addSubLines = (lines: { sectionId: string; name: string; amount: number; subId: string }[]) =>
    edit((d) =>
      d.map((s) => {
        const mine = lines.filter((l) => l.sectionId === s.id);
        if (!mine.length) return s;
        return {
          ...s,
          items: [...s.items, ...mine.map((l) => ({ ...blankDraftItem("subcontractor", l.name), unit_cost: l.amount, possible_sub_id: l.subId }))],
        };
      }),
    );
  const addSuggestedSub = (sectionId: string, sg: SubSuggestion) => {
    if (sg.categoryIds.length > 1) return setAddingSub(sg);
    addSubLines([{ sectionId, name: subLineName(sg.sub.label, sg.sub.note), amount: 0, subId: sg.sub.id }]);
  };
  const finishAddingSub = (choice: AddSubChoice) => {
    const sg = addingSub;
    setAddingSub(null);
    if (!sg) return;
    const { sub } = sg;
    const general = subPlanSections.find((s) => s.isGeneral);
    if (choice.mode === "one") {
      if (!general) return;
      const name = combinedLineName(sub.label, sg.categoryIds.map(categoryName).filter(Boolean));
      addSubLines([{ sectionId: general.id, name: subLineName(name, sub.note), amount: choice.amount, subId: sub.id }]);
      return;
    }
    addSubLines(
      sg.categoryIds.flatMap((cid) => {
        const target = sectionForCategory(subPlanSections, cid);
        if (!target) return [];
        // In General (the feature has no section) the line says which feature.
        const name = target.isGeneral ? combinedLineName(sub.label, [categoryName(cid)]) : sub.label;
        return [{ sectionId: target.id, name: subLineName(name, sub.note), amount: choice.amounts[cid] ?? 0, subId: sub.id }];
      }),
    );
  };
  const subSuggestionsFor = (section: DraftSection) => {
    const list = subSuggestions.get(section.id);
    if (!list?.length) return undefined;
    return (
      <div className="mx-4 mb-3 flex flex-wrap gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2">
        {list.map((sg) => (
          <div key={sg.sub.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Possible sub: <span className="font-semibold text-foreground">{sg.sub.label}</span>
              {sg.sub.note ? <span className="text-muted-foreground"> — {sg.sub.note}</span> : null}
              {sg.alsoCategoryIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {section.is_general ? "For" : "Also for"}: {sg.alsoCategoryIds.map(categoryName).filter(Boolean).join(", ")}
                </span>
              )}
            </span>
            <button type="button" onClick={() => addSuggestedSub(section.id, sg)} className="text-xs font-bold text-primary hover:underline">
              Add as subcontractor line
            </button>
          </div>
        ))}
      </div>
    );
  };
  const isDirty = dirty.current;
  // "3 unsaved changes" + the accent edge on edited sections.
  const savedDraft = useMemo(() => seed(sections), [sections]);
  const changes = useMemo(() => (isDirty ? draftChanges(draft, savedDraft) : null), [isDirty, draft, savedDraft]);
  const renderSectionCard = (
    section: DraftSection,
    index: number,
    drag: { handle: DraggableProvidedDragHandleProps | null | undefined; dragging: boolean } | null,
  ) => (
    <div id={`section-${section.id}`} className={cn("scroll-mt-24 rounded-card", changes?.changedIds.has(section.id) && EDITED_CLASS)}>
                      <MaterialsSectionCard
                        section={section}
                        materialCategories={materialCategories}
                        expenseCategories={expenseCategories}
                        sortMode={sortOf(section.id)}
                        onSortChange={(mode) => setItemSort((prev) => ({ ...prev, [section.id]: mode }))}
                        projectTypeOptions={projectTypeOptions}
                        jobCategories={jobCategories}
                        onTypeChange={(jobCategoryId) => setSectionType(section.id, jobCategoryId)}
                        priceBookItems={priceBookItems}
                        catalogItems={catalogItems}
                        priceOverrides={priceOverrides}
                        tracking={{
                          active: trackingActive,
                          byItemId: trackingByItemId,
                          onLogUsage: (itemId) => {
                            const line = trackedLines.find((l) => l.id === itemId);
                            if (line) setLogUsageLine(line);
                          },
                          onMarkFullyUsed: (itemId) => {
                            const line = trackedLines.find((l) => l.id === itemId);
                            if (line) markFullyUsedMut.mutate(line);
                          },
                          onReviseEstimate: (itemId) => {
                            const line = trackedLines.find((l) => l.id === itemId);
                            if (line) setReviseTarget(line);
                          },
                        }}
                        onRename={(name) => renameSection(section.id, name)}
                        featurePicker={featurePickerFor(section.id)}
                        onDelete={() => deleteSection(section.id)}
                        onAddItem={(type) => addItem(section.id, type)}
                        onEditLabor={(patch) => editLabor(section.id, patch)}
                        laborRate={laborRate}
                        onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
                        onDeleteItem={(iid) => deleteItem(section.id, iid)}
                        overheadConfigured={burdenPerHour(overheadSettings) != null}
                        onDismissOverhead={dismissOverheadWarning}
                        onApplyCalculatedLines={(lines, inputs) => applyCalculatedLines(section.id, lines, inputs)}
                        projectId={projectId}
                        dragHandleProps={drag?.handle ?? null}
                        dragging={drag?.dragging ?? false}
                        canMoveUp={!section.is_general && index > 0}
                        canMoveDown={!section.is_general && index < draftFeatureSections.length - 1}
                        onMoveUp={() => moveSection(index, -1)}
                        onMoveDown={() => moveSection(index, 1)}
                        onMoveItem={(itemIndex, direction) => moveItem(section.id, itemIndex, direction)}
                        collapsed={isCollapsed(section.id)}
                        onToggleCollapse={() => toggleCollapse(section.id)}
                        itemsCollapsed={itemsCollapse.isCollapsed(section.id)}
                        onToggleItems={() => itemsCollapse.toggle(section.id)}
                        isDraggingItem={isDraggingItem}
                        onAutoExpand={() => expandSection(section.id)}
                        proposedLabel={
                          section.feature?.source_quote_id
                            ? `Add-on quote #${addonNumbers.get(section.feature.source_quote_id) ?? "?"}`
                            : undefined
                        }
                        pendingChanges={pendingFor(section.feature_id)}
                        report={
                          (section.is_general || section.feature?.status === "active") &&
                          reportsByFeature.get(section.is_general ? null : section.feature_id) ? (
                            <FeatureReportStrip report={reportsByFeature.get(section.is_general ? null : section.feature_id)!} />
                          ) : undefined
                        }
                        onViewHistory={section.feature_id ? () => setHistoryFeatureId(section.feature_id) : undefined}
                        subSuggestions={subSuggestionsFor(section)}
                      />
    </div>
  );
  // The order sheet lists material lines only.
  const orderSheetSections = useMemo(
    () =>
      sections
        .filter(countsTowardTotals)
        .map((sec) => ({ ...sec, materials_items: sec.materials_items.filter((i) => (i.cost_type ?? "material") === "material") })),
    [sections],
  );
  const draftGeneral = draft.find((sec) => sec.is_general);
  const draftFeatureSections = draft.filter((sec) => !sec.is_general);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-5">
      <BackLink
        to={backHref}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >{backLabel}</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Cost plan</h1>
          <p className="mt-1 text-muted-foreground">{projectName ?? " "}</p>
          <GoToProjectLink projectId={projectId} isDirty={isDirty} className="mt-1.5" />
        </div>
        {sheetId && (
          <div className="flex max-w-full flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOrderSheetOpen(true)}
              disabled={orderSheetSections.every((s) => s.materials_items.length === 0)}
              className="font-bold"
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Generate Order Sheet
            </Button>
          </div>
        )}
      </div>

      {costSummary && (
        <div className="card-surface grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div>
            <div className={ITEM_FIELD_LABEL}>Estimated</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatCurrency(costSummary.estimatedCost)}</div>
          </div>
          <div>
            <div className={ITEM_FIELD_LABEL}>Actual to date</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatCurrency(costSummary.actualCost)}</div>
          </div>
          <div>
            <div className={ITEM_FIELD_LABEL}>Variance</div>
            <div className={cn("mt-1 text-lg font-bold tabular-nums", costSummary.varianceDollars > 0 ? "text-warning-strong" : "text-foreground")}>
              {costSummary.varianceDollars >= 0 ? "+" : ""}
              {formatCurrency(costSummary.varianceDollars)}
              {costSummary.variancePct != null && (
                <span className="ml-1 text-sm font-semibold">
                  ({costSummary.variancePct >= 0 ? "+" : ""}
                  {Math.round(costSummary.variancePct)}%)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* Not-ordered / over-estimate: the alerts bar below (same story as the project page). */}
            {costSummary.unplannedCount > 0 && (
              <span className="badge-status badge-pending">{pluralize(costSummary.unplannedCount, "unplanned item")}</span>
            )}
          </div>
        </div>
      )}

      {trackingActive && <PlannedVsActualCard projectId={projectId} showContext={false} showCloseout={false} />}

      <MaterialAlertsBar
        projectId={projectId}
        alerts={materialAlertList}
        sectionNames={alertSectionNames}
        context={startContext(project?.scheduled_start_date)}
        onMarkOrdered={(ids) => markOrderedMut.mutate(ids)}
        onNotNeeded={markNotNeeded}
        busy={markOrderedMut.isPending || notNeededMut.isPending}
      />

      {trackingActive && itemTrackingSummary.totalCount > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Tracking <span className="font-bold text-foreground">{itemTrackingSummary.trackedCount}</span> of{" "}
            {itemTrackingSummary.totalCount} materials
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-xs font-bold text-primary hover:underline">
                Manage tracking
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2 p-3">
              <p className="text-xs text-muted-foreground">
                Choose which materials show up in the Material Tracker. Toggle individual items below, or:
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setAllTracked(true)}>
                  Track all
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setAllTracked(false)}>
                  Track none
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Loading cost plan…</p>}
      {isError && <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>}

      {!isLoading && !isError && draft.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          Add a section to get started.
        </div>
      )}

      {draft.length > 0 && (
        <CollapseAllLinks
          onCollapseAll={() => collapseAll(draft.map((s) => s.id))}
          onExpandAll={() => expandAll(draft.map((s) => s.id))}
          items={{
            allCollapsed: draft.length > 0 && draft.every((s) => itemsCollapse.isCollapsed(s.id)),
            onCollapseAll: () => itemsCollapse.collapseAll(draft.map((s) => s.id)),
            onExpandAll: () => itemsCollapse.expandAll(draft.map((s) => s.id)),
          }}
        />
      )}

      <DragDropContext
        onDragStart={(start) => setIsDraggingItem(start.type === "item")}
        onDragEnd={(result) => {
          setIsDraggingItem(false);
          onDragEnd(result);
        }}
      >
        <Droppable droppableId="materials-sections" type="section">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-5">
              {draftFeatureSections.map((section, index) => (
                <Draggable key={section.id} draggableId={section.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      {renderSectionCard(section, index, { handle: dragProvided.dragHandleProps, dragging: dragSnapshot.isDragging })}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        {/* General — project-wide costs, pinned last: not draggable, not deletable. */}
        {draftGeneral && <div className="mt-5">{renderSectionCard(draftGeneral, draftFeatureSections.length, null)}</div>}
      </DragDropContext>

      {trackingActive && isTracked && deliveries.some((d) => d.item.materials_item_id == null) && (
        <UnplannedMaterialsCard sections={sections} deliveries={deliveries} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={addSection}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border bg-card text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add blank section
        </button>
        <button
          type="button"
          onClick={() => setSmartSectionOpen(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-primary/30 bg-primary/5 text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
        >
          <Wand2 className="h-4 w-4" />
          Create Smart Section
        </button>
      </div>

      {/* Cost plan total — after all sections, broken down by cost type. */}
      <div className="overflow-hidden rounded-card border-2 border-primary bg-sidebar px-5 py-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-background/55">
            Total cost · {pluralize(draft.length, "section")}
          </span>
          <span className="text-[26px] font-extrabold tracking-tight tabular-nums text-background">{formatCurrency(planTotals.total)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 sm:grid-cols-5">
          {COST_BUCKETS.map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-2 sm:block">
              <div className="text-[11px] font-semibold text-background/55">{COST_TYPE_GROUP_LABEL[k]}</div>
              <div className={cn("text-sm font-bold tabular-nums", planTotals[k] > 0 ? "text-background" : "text-background/40")}>
                {formatCurrency(planTotals[k])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* True cost (0110, internal) — overhead through planned labor. */}
      <div className="card-surface p-5">
        <TrueCostSummary
          direct={planTotals.total + planPendingSelections}
          directNote={
            planPendingSelections > 0
              ? `Includes ${formatCurrency(planPendingSelections)} for the client's selections — added as lines when the quote is approved`
              : undefined
          }
          manHours={plannedManHours(draft)}
          rate={planOverheadRate}
          price={planPrice}
          targetMarginPct={planTargetMargin}
          laborRate={averageLaborRate(draft)}
          settings={overheadSettings ?? null}
          lumpSumsWithoutHours={lumpSumsWithoutHours(draft)}
          rateNote={
            planOverheadRate != null
              ? project?.overhead_rate != null
                ? `Overhead ${formatCurrency(Number(project.overhead_rate))}/hr — the rate this job was sold with`
                : headlineForPlan?.overhead_rate != null
                  ? `Overhead ${formatCurrency(Number(headlineForPlan.overhead_rate))}/hr — stored on the quote`
                  : `Current overhead ${formatCurrency(planOverheadRate)}/hr`
              : null
          }
        />
      </div>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        count={changes?.count}
        autoSave={{ key: draft }}
      />

      <SmartSectionDialog
        open={smartSectionOpen}
        onOpenChange={setSmartSectionOpen}
        onCreate={addSmartSection}
      />

      <OrderSheetDialog
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        projectId={projectId}
        projectName={projectName ?? ""}
        deliveryAddress={project?.address ?? null}
        sections={orderSheetSections}
        catalogItems={catalogItems}
        priceBookItems={priceBookItems}
      />

      {historyFeatureId &&
        (() => {
          const f = features.find((x) => x.id === historyFeatureId);
          const ownSections = draft.filter((sec) => sec.feature_id === historyFeatureId);
          return (
            <FeatureHistoryDialog
              open
              onOpenChange={(open) => !open && setHistoryFeatureId(null)}
              featureName={f ? featureName(f, jobCategories) : "Feature"}
              events={featureHistory.filter((e) => e.feature_id === historyFeatureId)}
              currentCost={sumSectionTotals(ownSections, { all: true }).total}
              currentPrice={featurePrice(historyFeatureId, projectQuotes, projectChangeOrders)}
            />
          );
        })()}

      {logUsageLine && (
        <LogUsageDialog
          open={!!logUsageLine}
          onOpenChange={(open) => !open && setLogUsageLine(null)}
          line={logUsageLine}
        />
      )}

      <AddPossibleSubDialog
        sub={addingSub?.sub ?? null}
        features={(addingSub?.categoryIds ?? []).map((id) => ({ id, name: categoryName(id) }))}
        onOpenChange={(open) => !open && setAddingSub(null)}
        onAdd={finishAddingSub}
      />
      <Dialog open={!!reviseTarget} onOpenChange={(open) => !open && setReviseTarget(null)}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>Revise estimate — {reviseTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Records a new baseline for this line and keeps the original in history — estimate-vs-actual tracking always
            measures against the current one.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Why is this changing?</Label>
            <Textarea
              value={reviseReason}
              onChange={(e) => setReviseReason(e.target.value)}
              rows={2}
              placeholder="e.g. Site remeasure found more patio area than quoted"
              autoFocus
            />
          </div>
          <Button
            className="w-full font-bold"
            disabled={!reviseReason.trim() || reviseMut.isPending}
            onClick={() => reviseMut.mutate()}
          >
            {reviseMut.isPending ? "Saving…" : "Save new baseline"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Phase 2's "never drop them" group — delivered/ordered lines that don't
 * match any sheet line, shown on their own (not just counted) with a way
 * to retroactively match one to a line. Reuses MaterialsLinePicker, same
 * component the delivery-logging form uses. */
function UnplannedMaterialsCard({
  sections,
  deliveries,
}: {
  sections: MaterialsSection[];
  deliveries: DeliveryLineWithOrderStatus[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const unplanned = deliveries.filter((d) => d.item.materials_item_id == null);

  const matchMut = useMutation({
    mutationFn: ({ itemId, materialsItemId }: { itemId: string; materialsItemId: string | null }) =>
      matchMaterialOrderItem(itemId, materialsItemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-orders"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface space-y-3 p-5">
      <div>
        <h3 className="text-base font-bold text-foreground">Unplanned materials</h3>
        <p className="text-xs text-muted-foreground">Delivered, but not on this sheet — still counted in actual cost.</p>
      </div>
      <div className="space-y-2">
        {unplanned.map(({ item }) => (
          <div key={item.id} className="rounded-lg border border-hairline p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-foreground/80">
                {item.quantity} {materialOrderUnitLabel(item.unit, item.quantity)} — {item.description}
              </span>
              {item.unit_price != null && <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(item.unit_price)}/unit</span>}
            </div>
            <div className="mt-2">
              <MaterialsLinePicker
                sections={sections}
                value={null}
                onChange={(v) => matchMut.mutate({ itemId: item.id, materialsItemId: v })}
                placeholder="Match to a sheet line…"
                className="h-8 text-xs"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------

/** Material budget tracking (0080) — bundled so it's one new prop at every
 * layer instead of five. byItemId is empty (not present at all) for an
 * untracked sheet, so every row below just checks `tracking.byItemId.get
 * (item.id)` and renders nothing extra when it's undefined. */
interface TrackingContext {
  /** False before the job is Won / in progress (isProjectActive) — then
   * there's no panel and no Tracked toggle at all. */
  active: boolean;
  byItemId: Map<
    string,
    {
      /** Raw quantity of the latest explicit "Revise estimate", else null
       * (Est. then follows the line's live quantity + waste). */
      revisedQuantity: number | null;
      ordered: number;
      delivered: number;
      used: number;
      unit: string | null;
      /** Any order line is matched to it — "Ordered" even while its unit still needs converting. */
      hasOrder: boolean;
    }
  >;
  onLogUsage: (itemId: string) => void;
  onMarkFullyUsed: (itemId: string) => void;
  onReviseEstimate: (itemId: string) => void;
}

/** A not-yet-decided change order's cost changes on one feature — shown on
 * its section, never counted in totals. */
export interface PendingChangeOverlay {
  label: string;
  delta: number;
  lines: string[];
}

interface SectionCardProps {
  section: DraftSection;
  /** "Proposed · Add-on quote #1" for a proposed add-on feature. */
  proposedLabel?: string;
  /** Pending change orders on this section's feature (Phase C overlay). */
  pendingChanges?: PendingChangeOverlay[];
  /** Opens the feature's history (Original → CO #1 → … → Current). */
  onViewHistory?: () => void;
  /** Planned vs actual for the feature, once the job is Won (Phase E). */
  report?: ReactNode;
  /** Possible subcontracted work from the opportunity (0155) for this section. */
  subSuggestions?: ReactNode;
  materialCategories: MaterialCategory[];
  /** Only for the Price Book picker's labels — no longer a line field. */
  expenseCategories: ExpenseCategory[];
  sortMode: ItemSortMode;
  onSortChange: (mode: ItemSortMode) => void;
  /** The project's own Project types — the section tag's options. */
  projectTypeOptions: Category[];
  /** Every job category, to name a tag no longer among the project's types. */
  jobCategories: Category[];
  onTypeChange: (jobCategoryId: string | null) => void;
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
  tracking: TrackingContext;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** Adds a line of the given type (the split "+ Material ▾" button). */
  onAddItem: (type: LineCostType) => void;
  onEditLabor: (patch: Partial<LaborDraft>) => void;
  /** The contractor's labor rate — a new labor block starts at it. */
  laborRate: number;
  onEditItem: (itemId: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (itemId: string) => void;
  /** Overhead is set up — flag lines that look like overhead (0110). */
  overheadConfigured: boolean;
  onDismissOverhead: (itemId: string) => void;
  onApplyCalculatedLines: (lines: CalculatedLine[], inputs: Record<string, unknown>) => void;
  featurePicker: SectionFeaturePicker;
  /** For the calculator's "From site measurements" prefill. */
  projectId: string;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Moves the item at `itemIndex` (within this section) up/down one spot. */
  onMoveItem: (itemIndex: number, direction: -1 | 1) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Just the line items hidden behind "7 items · $4,200" (header + toolbar stay). */
  itemsCollapsed?: boolean;
  onToggleItems?: () => void;
  isDraggingItem: boolean;
  onAutoExpand: () => void;
}

function MaterialsSectionCard({
  section,
  materialCategories,
  expenseCategories,
  sortMode,
  onSortChange,
  projectTypeOptions,
  jobCategories,
  onTypeChange,
  priceBookItems,
  catalogItems,
  priceOverrides,
  tracking,
  onRename,
  onDelete,
  onAddItem,
  onEditLabor,
  laborRate,
  onEditItem,
  onDeleteItem,
  overheadConfigured,
  onDismissOverhead,
  onApplyCalculatedLines,
  featurePicker,
  projectId,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onMoveItem,
  collapsed,
  onToggleCollapse,
  itemsCollapsed = false,
  onToggleItems,
  isDraggingItem,
  onAutoExpand,
  proposedLabel,
  pendingChanges = [],
  onViewHistory,
  report,
  subSuggestions,
}: SectionCardProps) {
  // Every cost type + labor — the header total and the collapsed breakdown.
  const totals = sectionTotals(section);
  const subtotal = totals.total;
  const buildType = findSmartSectionTemplate(section.smart_section_build_type);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  // "Measurements available · Fill quantities": the project has site
  // measurements for this feature and nothing's been filled in yet. Opens
  // the calculator (which prefills from them) — never runs it on its own.
  const measurementPrefill = useMeasurementPrefill(projectId, buildType?.id ?? "", !!buildType, section.feature_id ?? null);
  const offerFillFromMeasurements =
    !!buildType && measurementPrefill.sources.length > 0 && section.items.every((i) => !i.quantity);
  // View order only — the saved manual order is untouched unless the user
  // reorders while sorted (the page handles that; see reorderFromSorted).
  // Lines stay grouped by type; the sort applies within each group.
  const displayItems = sortWithinTypeGroups(section.items, sortMode);
  const showGroupHeadings = new Set(displayItems.map((i) => i.cost_type)).size > 1;
  // Collapsed line items are compact rows (still sortable / draggable);
  // tapping one opens just that item. Showing the items again resets.
  const [openItemIds, setOpenItemIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!itemsCollapsed) setOpenItemIds(new Set());
  }, [itemsCollapsed]);
  const isCompact = (id: string) => itemsCollapsed && !openItemIds.has(id);
  const openItem = (id: string) => setOpenItemIds((prev) => new Set(prev).add(id));
  const groupSubtotal = (type: LineCostType) => displayItems.filter((i) => i.cost_type === type).reduce((sum, i) => sum + lineCost(i), 0);

  return (
    <SectionCard
      name={section.is_general ? "General" : section.name}
      onRename={onRename}
      nameReadOnly={section.is_general}
      featurePicker={section.is_general ? undefined : featurePicker}
      subtotal={subtotal}
      itemNames={displayItems.map((i) => materialLineLabel(i))}
      collapsedSummary={costBreakdownLabel(totals) || undefined}
      tag={
        section.is_general ? (
          <span className="text-[11px] font-semibold text-background/70">Project-wide costs — dumpster, permits, mobilization…</span>
        ) : section.feature_id ? (
          // A feature's section: its type is the feature's (fixed here).
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/[0.16] px-2.5 py-0.5 text-[11px] font-semibold text-background">
              {jobCategories.find((c) => c.id === section.job_category_id)?.name ?? "Feature"}
            </span>
            {section.feature?.status === "proposed" && (
              <span className="rounded-full bg-info/25 px-2.5 py-0.5 text-[11px] font-bold text-background">
                {proposedLabel ?? "Proposed"} · not counted yet
              </span>
            )}
            {pendingChanges.length > 0 && (
              <span className="rounded-full bg-warning/30 px-2.5 py-0.5 text-[11px] font-bold text-background">
                {pendingChanges.map((p) => p.label).join(", ")} pending
              </span>
            )}
            {section.feature?.status === "removed" && (
              <span className="rounded-full bg-destructive/30 px-2.5 py-0.5 text-[11px] font-bold text-background">
                Removed from project · not counted
              </span>
            )}
          </span>
        ) : (
          <SectionTypeChip
            value={section.job_category_id}
            options={projectTypeOptions}
            allCategories={jobCategories}
            onChange={onTypeChange}
          />
        )
      }
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      isDraggingItem={isDraggingItem}
      onAutoExpand={onAutoExpand}
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      pinned={section.is_general}
      secondRow={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {onToggleItems && <ItemsCollapseToggle collapsed={itemsCollapsed} onToggle={onToggleItems} count={section.items.length} />}
            {buildType && <SectionToolbarAction icon={Calculator} label="Calculate quantities" onClick={() => setCalculatorOpen(true)} />}
            {onViewHistory && <SectionToolbarAction icon={History} label="View history" onClick={onViewHistory} />}
            {offerFillFromMeasurements && (
              <SectionToolbarAction icon={Calculator} label="Fill quantities" measurements onClick={() => setCalculatorOpen(true)} />
            )}
            {section.items.length > 1 && (
              <Select value={sortMode} onValueChange={(v) => onSortChange(v as ItemSortMode)}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-muted px-2.5 text-xs font-semibold" aria-label="Sort line items">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual order</SelectItem>
                  <SelectItem value="cost_desc">Cost: high → low</SelectItem>
                  <SelectItem value="cost_asc">Cost: low → high</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {/* The General section is part of every cost plan — never deleted. */}
          {!section.is_general && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete section
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {section.items.length > 0 || totals.labor > 0
                    ? `Removes ${section.items.length} line${section.items.length === 1 ? "" : "s"}${totals.labor > 0 ? " and its labor" : ""} totaling ${formatCurrency(subtotal)} from the cost plan. Nothing is saved until you press Save changes.`
                    : "This section is empty."}
                  {section.feature_id && section.feature?.status === "active" && (
                    <span className="mt-2 block">It also takes this feature off the project (its measurements are kept).</span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDelete}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      }
    >
      {/* Collapsed = compact rows, same order / sort / drag as expanded. */}
      <Droppable droppableId={section.id} type="item">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={cn("flex flex-col", itemsCollapsed ? "gap-1.5" : "gap-3")}>
            {displayItems.map((item, index) => (
              <Fragment key={item.id}>
              {showGroupHeadings && item.cost_type !== displayItems[index - 1]?.cost_type && (
                <div className={cn("flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wider text-muted-subtle", index > 0 && "mt-2")}>
                  <span>{COST_TYPE_GROUP_LABEL[item.cost_type]}</span>
                  {itemsCollapsed && <span className="tabular-nums normal-case tracking-normal">{formatCurrency(groupSubtotal(item.cost_type))}</span>}
                </div>
              )}
              <Draggable draggableId={item.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} id={`line-${item.id}`} className="scroll-mt-24 rounded-2xl transition-shadow">
                    {isCompact(item.id) ? (
                      <CompactLineRow
                        name={item.name}
                        detail={item.cost_type === "material" ? item.color : item.vendor}
                        quantity={item.quantity}
                        unit={item.unit}
                        total={lineCost(item)}
                        onExpand={() => openItem(item.id)}
                        dragHandleProps={dragProvided.dragHandleProps}
                        dragging={dragSnapshot.isDragging}
                        canMoveUp={index > 0}
                        canMoveDown={index < section.items.length - 1}
                        onMoveUp={() => onMoveItem(index, -1)}
                        onMoveDown={() => onMoveItem(index, 1)}
                      />
                    ) : item.cost_type !== "material" ? (
                      <CostLineRow
                        item={item}
                        onEdit={(patch) => onEditItem(item.id, patch)}
                        onDelete={() => onDeleteItem(item.id)}
                        dragHandleProps={dragProvided.dragHandleProps}
                        dragging={dragSnapshot.isDragging}
                        canMoveUp={index > 0}
                        canMoveDown={index < section.items.length - 1}
                        onMoveUp={() => onMoveItem(index, -1)}
                        onMoveDown={() => onMoveItem(index, 1)}
                      />
                    ) : (
                    <ItemRow
                      item={item}
                      materialCategories={materialCategories}
                      expenseCategories={expenseCategories}
                      priceBookItems={priceBookItems}
                      catalogItems={catalogItems}
                      priceOverrides={priceOverrides}
                      tracking={tracking}
                      onEdit={(patch) => onEditItem(item.id, patch)}
                      onDelete={() => onDeleteItem(item.id)}
                      dragHandleProps={dragProvided.dragHandleProps}
                      dragging={dragSnapshot.isDragging}
                      canMoveUp={index > 0}
                      canMoveDown={index < section.items.length - 1}
                      onMoveUp={() => onMoveItem(index, -1)}
                      onMoveDown={() => onMoveItem(index, 1)}
                    />
                    )}
                    {!isCompact(item.id) && overheadConfigured && !item.overhead_warning_dismissed && looksLikeOverhead(item.name) && (
                      <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />
                        <span className="min-w-0 flex-1">This looks like overhead that's already covered by your overhead rate.</span>
                        <button type="button" onClick={() => onDismissOverhead(item.id)} className="shrink-0 font-semibold text-muted-foreground hover:text-foreground">
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Draggable>
              </Fragment>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {/* The section's primary action — "+ Material", with Subcontractor /
          Equipment / Other behind the ▾. */}
      <AddLineSplitButton
        onAdd={(type) => {
          // A new line shows the items again so it's visible.
          if (itemsCollapsed) onToggleItems?.();
          onAddItem(type);
        }}
      />

      {/* Labor — below the lines; collapsed to "+ Add labor" while empty,
          one compact line while the items are collapsed. */}
      {itemsCollapsed && section.labor_mode ? (
        <button
          type="button"
          onClick={onToggleItems}
          title="Expand items"
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 text-left text-sm sm:min-h-10"
        >
          <HardHat className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-semibold text-foreground">Labor</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{(laborFormula(section) ?? "").replace(/\s*=\s*[^=]*$/, "")}</span>
          <span className="shrink-0 pr-1 text-sm font-bold tabular-nums text-foreground">{formatCurrency(totals.labor)}</span>
        </button>
      ) : (
        <>
          <SectionLaborBlock value={section} defaultRate={laborRate} onChange={onEditLabor} />
          <LaborInsight projectId={projectId} section={section} onEditLabor={onEditLabor} />
        </>
      )}

      {/* Pending change orders on this feature — shown, never in totals. */}
      {pendingChanges.map((p) => (
        <div key={p.label} className="mt-3 rounded-2xl border-[1.5px] border-dashed border-warning/60 bg-warning/5 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">Pending {p.label}</span>
            <span className="text-xs text-muted-foreground">pending · not in totals</span>
            <span className="ml-auto text-sm font-extrabold tabular-nums text-foreground">
              {p.delta < 0 ? "−" : "+"}
              {formatCurrency(Math.abs(p.delta))}
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {p.lines.map((l, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {l}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {subSuggestions}

      {report}

      {buildType && (
        <SmartSectionCalculatorDialog
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          template={buildType}
          catalogItems={catalogItems}
          onApply={onApplyCalculatedLines}
          projectId={projectId}
          featureId={section.feature_id ?? null}
        />
      )}
    </SectionCard>
  );
}

/** The project type matching a Smart Section build type, by name
 * ("paver_patio" ↔ "Paver Patio"), among the project's own types. */
function matchProjectTypeForBuildType(buildTypeId: string, options: Category[]): string | null {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
  const target = norm(findSmartSectionTemplate(buildTypeId)?.label ?? buildTypeId);
  return options.find((c) => norm(c.name) === target)?.id ?? null;
}

const ITEM_FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

interface ItemRowProps {
  item: DraftItem;
  materialCategories: MaterialCategory[];
  /** Only for the Price Book picker's labels. */
  expenseCategories: ExpenseCategory[];
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
  tracking: TrackingContext;
  onEdit: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ItemRow({
  item,
  materialCategories,
  expenseCategories,
  priceBookItems,
  catalogItems,
  priceOverrides,
  tracking,
  onEdit,
  onDelete,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: ItemRowProps) {
  const trackData = tracking.byItemId.get(item.id);
  // Est. = the line's current quantity with waste, live as it's edited —
  // until an explicit "Revise estimate" sets a different tracked number.
  const track = trackData
    ? (() => {
        const estimated = quantityWithWaste(trackData.revisedQuantity ?? item.quantity, item.waste_percent);
        return {
          ...trackData,
          estimated,
          status: lineStatus(estimated, trackData.ordered, trackData.delivered, trackData.used, trackData.hasOrder),
        };
      })()
    : undefined;
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [costStr, setCostStr] = useState(String(item.unit_cost));
  const [wasteStr, setWasteStr] = useState(String(item.waste_percent));
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setCostStr(String(item.unit_cost)), [item.unit_cost]);
  useEffect(() => setWasteStr(String(item.waste_percent)), [item.waste_percent]);

  // Required quantity with waste drives the total and the order suggestion.
  const adjustedQty = quantityWithWaste(item.quantity, item.waste_percent);
  const total = materialsLineTotal(item);
  const linked = item.price_book_item_id != null;
  const catalogProduct = catalogItems.find((c) => c.id === item.catalog_product_id);
  const catalogLinked = catalogProduct != null;

  const applyPick = (pbi: PriceBookItem) => {
    onEdit({
      name: pbi.name,
      unit: normalizeMaterialUnit(pbi.unit),
      unit_cost: Number(pbi.unit_price),
      // Kept in sync silently (not shown) — see 0094.
      expense_category_id: pbi.expense_category_id,
      material_category_id: materialCategoryIdByName(materialCategories, pbi.category) ?? item.material_category_id,
      price_book_item_id: pbi.id,
      catalog_product_id: null,
      rememberPrice: false,
    });
    setPickerOpen(false);
  };

  const applyCatalogPick = (product: ProductCatalogItem) => {
    const override = priceOverrides.find((o) => o.catalog_product_id === product.id);
    onEdit({
      name: product.name,
      unit: normalizeMaterialUnit(product.unit),
      // A different product's colors don't apply — keep the color only when
      // re-picking the same product.
      color: product.id === item.catalog_product_id ? item.color : "",
      unit_cost: override?.price ?? 0,
      material_category_id: materialCategoryIdByName(materialCategories, product.category) ?? item.material_category_id,
      price_book_item_id: null,
      catalog_product_id: product.id,
      rememberPrice: false,
    });
    setPickerOpen(false);
  };

  // Next whole package above the waste-adjusted quantity (Catalog lines
  // with package specs only). "Use N" records the overage as extra waste,
  // so the measured quantity itself never changes.
  const orderableQty = catalogLinked ? nextOrderableQuantity(adjustedQty, catalogProduct?.specs) : null;
  const unitLabel = item.unit || "units";
  const colorOptions = catalogProduct?.colors ?? [];

  return (
    <div
      className={cn(
        "group flex flex-col gap-3.5 rounded-2xl border border-hairline p-4 transition-shadow hover:border-input hover:shadow-card-hover",
        dragging && "border-primary/40 opacity-90 shadow-card-hover",
      )}
    >
      {/* Item name + price book picker + handle/arrows + delete — the
          label sits on its own line above; the input and every button
          share one row so they center on the input itself (not the
          label+input block), independent of everything below (category,
          qty/cost fields). */}
      {/* sm+: "ITEM" label on its own line, then name · Price Book · Tracked ·
          reorder · delete on one line. Phones reorder the same elements (no
          duplicates — the drag handle can only exist once): label + reorder/
          delete on top, then the full-width name (+ color), then Price Book /
          Tracked. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className={cn(ITEM_FIELD_LABEL, "flex-1 sm:-mb-1 sm:basis-full")}>Item</div>
        <div className="order-2 flex min-w-0 basis-full flex-col gap-2 sm:order-none sm:flex-1 sm:basis-auto sm:flex-row sm:items-center">
            <AutoGrowTextarea
              value={item.name}
              onChange={(e) => onEdit({ name: e.target.value })}
              placeholder="Item name"
              // flex-1 only when the row is horizontal (sm+) — in the phone's
              // column layout it would pin the height and clip wrapped names.
              className="min-w-0 rounded-xl bg-muted px-3 py-2 text-[15px] font-semibold hover:border-input focus-visible:border-primary sm:flex-1"
            />
            {/* Color — once a Catalog product is picked. Its color list, or
                a typed custom color when there's none / it isn't listed. */}
            {catalogLinked && (
              <OptionOrCustomField
                value={item.color}
                onChange={(color) => onEdit({ color })}
                options={colorOptions}
                placeholder={colorOptions.length ? "Color" : "Color (optional)"}
                customPlaceholder="Type a color"
                otherLabel="Other color…"
                ariaLabel="Color"
                className="sm:w-44"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "order-3 flex h-[30px] min-w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors sm:order-none",
              linked || catalogLinked
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "text-muted-subtle hover:bg-primary/10 hover:text-primary",
            )}
            aria-label="Pick from Price Book or Catalog"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>Price Book</span>
          </button>
          {/* Track / Don't Track only means something once the job is on. */}
          {tracking.active && (
            <button
              type="button"
              onClick={() => onEdit({ tracked: !item.tracked })}
              className={cn(
                "order-3 flex h-[30px] min-w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors sm:order-none",
                item.tracked
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : "text-muted-subtle hover:bg-primary/10 hover:text-primary",
              )}
              aria-pressed={item.tracked}
              aria-label={
                item.tracked
                  ? "Tracked in the Material Tracker — click to stop tracking"
                  : "Not tracked — click to track in the Material Tracker"
              }
              title={item.tracked ? "Tracked in Material Tracker" : "Not tracked"}
            >
              {item.tracked ? <Eye className="h-4 w-4 shrink-0" /> : <EyeOff className="h-4 w-4 shrink-0" />}
              <span>{item.tracked ? "Tracked" : "Not tracked"}</span>
            </button>
          )}
          <div className="order-1 flex shrink-0 items-center gap-3 sm:order-none">
            <ReorderControls
              dragHandleProps={dragHandleProps}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              label={item.name || "item"}
              className="sm:mr-2"
            />
            <button
              type="button"
              onClick={onDelete}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
      </div>

      {/* Category (0094) — the line's one category, from Settings >
          Material categories. Prefilled from the Catalog/Price Book source
          at pick time, always editable. Groups the Order Sheet. (The old
          cost category is no longer shown; its data is kept.) */}
      <div>
        <div className={ITEM_FIELD_LABEL}>Category</div>
        <Select
          value={item.material_category_id ?? NONE}
          onValueChange={(v) => onEdit({ material_category_id: v === NONE ? null : v })}
        >
          <SelectTrigger className="mt-1 h-[42px]" aria-label="Category">
            <SelectValue placeholder="Uncategorized" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Uncategorized</SelectItem>
            {materialCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Qty · Unit · Waste % · Unit cost · Total — two-up on mobile, five-up from sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Qty</div>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => {
              setQtyStr(e.target.value);
              onEdit({ quantity: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Quantity"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit</div>
          <OptionOrCustomField
            value={item.unit}
            onChange={(unit) => onEdit({ unit })}
            options={MATERIAL_UNITS}
            placeholder="Choose unit"
            customPlaceholder="Custom unit"
            ariaLabel="Unit"
            className="mt-1"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Waste %</div>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={wasteStr}
            onChange={(e) => {
              setWasteStr(e.target.value);
              onEdit({ waste_percent: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Waste percent"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit cost</div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={costStr}
            onChange={(e) => {
              setCostStr(e.target.value);
              onEdit({ unit_cost: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Unit cost"
          />
          {catalogLinked && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Checkbox
                checked={item.rememberPrice}
                onCheckedChange={(v) => onEdit({ rememberPrice: v === true })}
              />
              Remember this price for next time
            </label>
          )}
        </label>
        <div>
          <div className={ITEM_FIELD_LABEL}>Total</div>
          <div className="mt-1 flex h-[42px] items-center justify-end rounded-md bg-primary/10 px-3 text-base font-extrabold tabular-nums text-success">
            {formatCurrency(total)}
          </div>
        </div>
      </div>

      {/* Waste math + order suggestion — one always-present line (fixed
          min height) so neither ever shifts the layout. A plain muted hint,
          never an error; ignoring it changes nothing. */}
      <div className="-mt-1.5 flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {item.quantity > 0 && item.waste_percent > 0 && (
          <span className="tabular-nums">
            {formatQty(item.quantity)} {unitLabel} + {formatQty(item.waste_percent)}% waste ={" "}
            <span className="font-semibold text-foreground">
              {formatQty(adjustedQty)} {unitLabel}
            </span>
          </span>
        )}
        {orderableQty != null && (
          <span className="tabular-nums">
            Next full package: {formatQty(orderableQty)} {unitLabel} ·{" "}
            <button
              type="button"
              onClick={() => onEdit({ waste_percent: wastePercentToReach(item.quantity, orderableQty) })}
              className="font-semibold text-primary hover:underline"
              title="Keeps the quantity and adds the extra to the waste %"
            >
              Use {formatQty(orderableQty)}
            </button>
          </span>
        )}
      </div>

      {track && <MaterialTrackingRow itemId={item.id} itemName={materialLineLabel(item)} unit={item.unit} track={track} tracking={tracking} />}

      <MaterialPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        priceBookItems={priceBookItems}
        expenseCategories={expenseCategories}
        catalogItems={catalogItems}
        onSelectPriceBook={applyPick}
        onSelectCatalog={applyCatalogPick}
      />
    </div>
  );
}

const LINE_STATUS_BADGE: Record<LineStatus, string> = {
  not_ordered: "badge-status badge-pending",
  ordered: "badge-status badge-info",
  delivered: "badge-status badge-info",
  in_use: "badge-status badge-scheduled",
  used_up: "badge-status badge-paid",
  over_estimate: "badge-status badge-overdue",
};

/** Phase 4's live tracking row — Est/Ordered/Delivered/Used, a segmented
 * progress bar (used within delivered within estimated), the status chip,
 * and the three tracking actions. Only rendered for a tracked sheet's
 * saved lines (a brand-new "tmp-" row has no baseline yet). */
function MaterialTrackingRow({
  itemId,
  itemName,
  unit,
  track,
  tracking,
}: {
  itemId: string;
  itemName: string;
  unit: string;
  track: { estimated: number; ordered: number; delivered: number; used: number; status: LineStatus };
  tracking: TrackingContext;
}) {
  const { estimated, ordered, delivered, used, status } = track;
  const denom = Math.max(estimated, ordered, delivered, used, 1);
  const u = unit || "units";
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="mt-1 space-y-2 rounded-xl border border-hairline bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80">
          Est. {estimated} {u} · Ordered {ordered} · Delivered {delivered} · Used {used}
        </span>
        <span className={LINE_STATUS_BADGE[status]}>{LINE_STATUS_LABEL[status]}</span>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="absolute inset-y-0 left-0 rounded-full bg-info/40" style={{ width: `${Math.min(100, (delivered / denom) * 100)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, (used / denom) * 100)}%` }} />
      </div>

      {status === "over_estimate" && (
        <p className="text-[11px] font-semibold text-warning-strong">
          {(used - estimated).toFixed(2)} {u} over the {estimated} {u} estimate
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => tracking.onLogUsage(itemId)}>
          Log usage
        </Button>
        {delivered > used && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => tracking.onMarkFullyUsed(itemId)}>
            Mark fully used
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => tracking.onReviseEstimate(itemId)}>
          Revise estimate
        </Button>
        {used > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
            View usage log
          </Button>
        )}
      </div>

      {historyOpen && (
        <UsageLogHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} line={{ id: itemId, name: itemName, unit }} />
      )}
    </div>
  );
}

function MaterialPickerDialog({
  open,
  onOpenChange,
  priceBookItems,
  expenseCategories,
  catalogItems,
  onSelectPriceBook,
  onSelectCatalog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceBookItems: PriceBookItem[];
  expenseCategories: ExpenseCategory[];
  catalogItems: ProductCatalogItem[];
  onSelectPriceBook: (item: PriceBookItem) => void;
  onSelectCatalog: (item: ProductCatalogItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Pick a material</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="price-book" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="price-book">Price Book</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>
          <TabsContent value="price-book" className="mt-2 min-h-0 flex-1 overflow-hidden">
            <PriceBookTabContent
              priceBookItems={priceBookItems}
              expenseCategories={expenseCategories}
              onSelect={onSelectPriceBook}
            />
          </TabsContent>
          <TabsContent value="catalog" className="mt-2 min-h-0 flex-1 overflow-hidden">
            <CatalogPicker catalogItems={catalogItems} onSelect={onSelectCatalog} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PriceBookTabContent({
  priceBookItems,
  expenseCategories,
  onSelect,
}: {
  priceBookItems: PriceBookItem[];
  expenseCategories: ExpenseCategory[];
  onSelect: (item: PriceBookItem) => void;
}) {
  const [filter, setFilter] = useState("");

  const categoryName = (categoryId: string | null) =>
    expenseCategories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
  const filtered = priceBookItems.filter((i) =>
    i.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {priceBookItems.length > 0 && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search your saved materials…"
          autoFocus
        />
      )}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {priceBookItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Your Price Book is empty. Add items in Settings → Price Book, then pick them here
            instead of retyping them every job.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {filtered.map((pbi) => (
              <button
                key={pbi.id}
                type="button"
                onClick={() => onSelect(pbi)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{pbi.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {pbi.unit ? `${pbi.unit} · ` : ""}
                    {formatCurrency(pbi.unit_price)} · {categoryName(pbi.expense_category_id)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/responsive/ActionMenu";
import { BuilderActionBar, BreakdownRow } from "@/components/responsive/BuilderActionBar";
import { SheetSelect } from "@/components/responsive/SheetSelect";
import { ResponsiveDialog } from "@/components/responsive/ResponsiveDialog";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { StatusPill } from "@/components/common/StatusPill";
import { ReorderControls } from "@/components/common/ReorderControls";
import { SectionCard } from "@/components/common/SectionCard";
import { LinkedDocumentBar } from "@/components/common/LinkedDocumentBar";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { useSectionReorder } from "@/hooks/use-section-reorder";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { needsExplicitDocumentLink } from "@/lib/documentLink";
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
import { quoteStatusMeta } from "@/lib/statusMeta";
import {
  getProject,
  listMaterials,
  listMaterialsBySheet,
  listMaterialsSheets,
  createMaterialsSheet,
  updateMaterialsSheet,
  deleteMaterialsSheet,
  listQuotes,
  linkQuoteToMaterialSheet,
  quoteTotal,
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
  materialsCogs,
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
} from "@/lib/api";
import { SmartSectionDialog } from "@/components/materials/SmartSectionDialog";
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
import { ProjectTypeChip } from "@/components/common/ProjectTypeChip";
import {
  orderedQuantity,
  deliveredQuantity,
  usedQuantity,
  effectiveEstimate,
  lineStatus,
  sheetCostSummary,
  executionTrackedLines,
  trackingSummary,
  LINE_STATUS_LABEL,
  type LineStatus,
  type DeliveryLineWithOrderStatus,
} from "@/lib/materialTracking";
import { BackLink } from "@/components/common/BackLink";

const NONE = "__none__";

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
}
interface DraftSection {
  id: string;
  name: string;
  /** Set when this section was created via "Create Smart Section" — which
   * build type it is, so its header can show the calculator icon. Set
   * once at creation, never changes afterward. */
  smart_section_build_type: string | null;
  /** Project-type tag (0094) — one of the project's own Job Categories. */
  job_category_id: string | null;
  items: DraftItem[];
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const seed = (sections: MaterialsSection[]): DraftSection[] =>
  sections.map((s) => ({
    id: s.id,
    name: s.name,
    smart_section_build_type: s.smart_section_build_type ?? null,
    job_category_id: s.job_category_id ?? null,
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
    })),
  }));

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
  a.tracked !== b.tracked;

/**
 * Route entry for /projects/:id/materials. Most projects have exactly one
 * materials sheet — go straight into its builder, indistinguishable from
 * how this screen has always worked (no visible "sheet" chrome). Once a
 * project's scope has grown enough to have more than one sheet, this
 * becomes ambiguous — show the sheet list instead (mirrors ProjectQuotesView
 * for quotes) and let the user pick one, or add another.
 */
export function ProjectMaterialsView() {
  const { id = "" } = useParams();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["materials-sheets", { project: id }],
    queryFn: () => listMaterialsSheets(id),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading materials sheet…</p>;

  if (sheets.length > 1) {
    return <MaterialsSheetsListView projectId={id} projectName={project?.name} sheets={sheets} />;
  }

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

/** Route entry for /projects/:id/materials/:sheetId — reached from the
 * sheet list above when a project has more than one sheet. */
export function ProjectMaterialsSheetDetailView() {
  const { id = "", sheetId = "" } = useParams();
  const location = useLocation();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });

  // Carried over, once, from the opportunity page's "Create material
  // sheet" action (OpportunityDetailView) — a reference only, never
  // persisted or parsed into real line items, so the contractor doesn't
  // have to flip back and forth to re-read what the lead's own
  // Measurements field said while pricing the job.
  const measurementsReference = (location.state as { measurementsReference?: string } | null)?.measurementsReference;
  const [showReference, setShowReference] = useState(!!measurementsReference);

  return (
    <div className="space-y-4">
      {showReference && measurementsReference && (
        <div className="mx-auto flex max-w-4xl items-start justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-subtle">From the lead's measurements</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{measurementsReference}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowReference(false)}
            className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
      <MaterialsSheetBuilder
        projectId={id}
        projectName={project?.name}
        sheetId={sheetId}
        backHref={`/projects/${id}/materials`}
        backLabel="Back to materials sheets"
      />
    </div>
  );
}

function MaterialsSheetsListView({
  projectId,
  projectName,
  sheets,
}: {
  projectId: string;
  projectName: string | undefined;
  sheets: MaterialsSheet[];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allSections = [] } = useQuery({
    queryKey: ["materials", { project: projectId }],
    queryFn: () => listMaterials(projectId),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId),
  });

  const addMut = useMutation({
    mutationFn: () => createMaterialsSheet(projectId, { name: "New materials sheet" }),
    onSuccess: (sheet) => {
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      navigate(`/projects/${projectId}/materials/${sheet.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      <BackLink
        to={`/projects/${projectId}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >Back to project</BackLink>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Materials sheets</h1>
          <p className="mt-1 text-muted-foreground">{projectName ?? " "}</p>
        </div>
        <Button onClick={() => addMut.mutate()} disabled={addMut.isPending} className="font-bold">
          <Plus className="mr-2 h-4 w-4" />
          Add materials sheet
        </Button>
      </div>

      <div className="space-y-3">
        {sheets.map((sheet) => {
          const sections = allSections.filter((s) => s.sheet_id === sheet.id);
          const cost = materialsCogs(sections);
          const linkedQuote = quotes.find((q) => q.material_sheet_id === sheet.id);
          return (
            <Link
              key={sheet.id}
              to={`/projects/${projectId}/materials/${sheet.id}`}
              className="card-surface flex items-center justify-between gap-3 p-5 transition-shadow hover:shadow-card-hover"
            >
              <div className="min-w-0">
                <div className="truncate font-bold text-foreground">{sheet.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {pluralize(sections.length, "section")}
                  {linkedQuote ? ` · Linked to ${formatCurrency(quoteTotal(linkedQuote.quote_sections))} quote` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-bold text-foreground">{formatCurrency(cost)}</span>
                <ChevronRight className="h-4 w-4 text-muted-subtle" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
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

// Stable fallback while the sheet loads — a fresh `[]` each render would
// re-fire the draft-seeding effect below in an endless render loop.
const NO_SECTIONS: MaterialsSection[] = [];

function MaterialsSheetBuilder({ projectId, projectName, sheetId, backHref, backLabel }: MaterialsSheetBuilderProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sections = NO_SECTIONS, isLoading, isError, error } = useQuery({
    queryKey: ["materials", { sheet: sheetId }],
    queryFn: () => listMaterialsBySheet(sheetId!),
    enabled: !!sheetId,
    refetchOnWindowFocus: false,
  });
  // Sibling documents in this project — drive the "more than one sheet or
  // quote" ambiguity check and the Link-a-quote picker below.
  const { data: sheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: projectId }],
    queryFn: () => listMaterialsSheets(projectId),
  });
  const { data: projectQuotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId),
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
  const trackedLines: MaterialsItem[] = sections.flatMap((s) => s.materials_items);
  const isTracked = trackedLines.length > 0;
  const trackedLineIds = trackedLines.map((l) => l.id);
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", trackedLineIds],
    queryFn: () => listUsageLogsForItems(trackedLineIds),
    enabled: trackedLineIds.length > 0,
  });
  const costSummary = isTracked ? sheetCostSummary(trackedLines, deliveries, usageLogs) : null;

  const trackingByItemId = useMemo(() => {
    const map = new Map<
      string,
      { estimated: number; ordered: number; delivered: number; used: number; status: LineStatus; unit: string | null }
    >();
    for (const line of executionTrackedLines(trackedLines)) {
      const estimated = effectiveEstimate(line).quantity;
      const ordered = orderedQuantity(line, deliveries);
      const delivered = deliveredQuantity(line, deliveries);
      const used = usedQuantity(line, usageLogs);
      map.set(line.id, { estimated, ordered, delivered, used, status: lineStatus(estimated, ordered, delivered, used), unit: line.unit });
    }
    return map;
  }, [trackedLines, deliveries, usageLogs]);

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
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const dirty = useRef(false);

  // Seed the draft from the server — but never clobber unsaved edits.
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(sections));
  }, [sections]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: DraftSection[]) => DraftSection[]) => {
    markDirty();
    setDraft((d) => fn(d));
  };
  const { moveSection, moveItem: moveItemRaw, onDragEnd: onDragEndRaw } = useSectionReorder<DraftItem, DraftSection>(edit);
  // Reordering an item while its section is sorted by cost: the sorted
  // order becomes the new manual order first, then the move applies on top
  // and the section switches back to Manual. Sorting alone never touches
  // the saved order.
  const reorderFromSorted = (sectionIds: string[]) => {
    const sorted = sectionIds.filter((sid) => sortOf(sid) !== "manual");
    if (sorted.length === 0) return;
    edit((d) => d.map((s) => (sorted.includes(s.id) ? { ...s, items: sortItemsByCost(s.items, sortOf(s.id)) } : s)));
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
  // Tracked only so a collapsed section's header knows to auto-expand on
  // hover while a line item is being dragged over it — collapsing hides the
  // item Droppable's visible content but keeps it mounted (see SectionCard).
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  const discard = () => {
    dirty.current = false;
    setDraft(seed(sections));
  };

  // --- local mutators -------------------------------------------------------
  const renameSection = (sid: string, name: string) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, name } : s)));
  const deleteSection = (sid: string) => edit((d) => d.filter((s) => s.id !== sid));
  const setSectionType = (sid: string, job_category_id: string | null) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, job_category_id } : s)));
  const addSection = () =>
    edit((d) => [...d, { id: tmpId(), name: "", smart_section_build_type: null, job_category_id: null, items: [] }]);
  // Step 1 of Smart Section is a template, not a calculator: it lands as
  // an ordinary new draft section with blank-quantity/price line items
  // named per the build type. Indistinguishable from manually-added rows
  // from this point on, so everything below (edit, delete, add more rows,
  // Save) treats it exactly the same. The build type is remembered on the
  // section so its header can show the calculator icon (step 2).
  const addSmartSection = (buildTypeId: string, name: string, lineItems: string[]) =>
    edit((d) => [
      ...d,
      {
        id: tmpId(),
        name,
        smart_section_build_type: buildTypeId,
        // Auto-tag with the project type matching this build type
        // (e.g. "Paver Patio"), when the project has one.
        job_category_id: matchProjectTypeForBuildType(buildTypeId, projectTypeOptions),
        items: lineItems.map((itemName) => ({
          id: tmpId(),
          name: itemName,
          quantity: 0,
          unit_cost: 0,
          expense_category_id: null,
          category: null,
          material_category_id: null,
          unit: "",
          price_book_item_id: null,
          catalog_product_id: null,
          waste_percent: 0,
          color: "",
          tracked: true,
          rememberPrice: false,
        })),
      },
    ]);
  // Step 2 — the calculator writes quantities into the section's existing
  // line items, matched purely by name against the build type's fixed
  // template (never by position). A line the calculator doesn't return
  // (deleted by the user, or an optional line not applicable this run) is
  // left untouched; a custom line the user added outside the template
  // never matches any calculated line, so it's left alone too.
  const applyCalculatedLines = (sid: string, lines: CalculatedLine[]) =>
    edit((d) =>
      d.map((s) => {
        if (s.id !== sid) return s;
        return {
          ...s,
          items: s.items.map((item) => {
            const line = lines.find((l) => l.name === item.name);
            if (!line) return item;
            const patch: Partial<DraftItem> = { quantity: line.quantity, unit: normalizeMaterialUnit(line.unit) };
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
  const addItem = (sid: string) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  id: tmpId(),
                  name: "",
                  quantity: 0,
                  unit_cost: 0,
                  expense_category_id: null,
                  category: null,
                  material_category_id: null,
                  unit: "",
                  price_book_item_id: null,
                  catalog_product_id: null,
                  waste_percent: 0,
                  color: "",
                  tracked: true,
                  rememberPrice: false,
                },
              ],
            }
          : s,
      ),
    );
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
  const saveMut = useMutation({
    mutationFn: async () => {
      // No sheet exists yet (brand-new project) — create it lazily, exactly
      // like a brand-new section/item's tmp- id resolves to a real row here.
      const currentSheetId = sheetId ?? (await createMaterialsSheet(projectId, { name: "Materials sheet" })).id;

      const serverSections = new Map(sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.map((s) => s.id));

      // 1. deletes — server sections no longer in the draft (cascades their items)
      for (const s of sections) {
        if (!draftSectionIds.has(s.id)) await deleteMaterialsSection(s.id);
      }

      // 2. per section: create / rename, then its items
      for (let si = 0; si < draft.length; si++) {
        const ds = draft[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await createMaterialsSection(projectId, currentSheetId, {
            name,
            sort_order: si,
            smart_section_build_type: ds.smart_section_build_type,
            job_category_id: ds.job_category_id,
          });
          sectionId = created.id;
        } else if (server.name !== name || server.sort_order !== si) {
          await updateMaterialsSection(server.id, { name, sort_order: si });
        }
        if (server && (server.job_category_id ?? null) !== ds.job_category_id) {
          await updateMaterialsSection(server.id, { job_category_id: ds.job_category_id });
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
            await addMaterialsItem(sectionId, {
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
            });
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
      qc.invalidateQueries({ queryKey: ["materials", { sheet: sheetId }] });
      qc.invalidateQueries({ queryKey: ["materials", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["catalog-price-overrides"] });
      toast({ title: "Materials sheet saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // --- sibling-document linking (0042) ------------------------------------
  // Only ambiguous — and only shown — once this project has more than one
  // materials sheet or more than one quote. Below that, a single sheet's
  // cost feeds a single quote's Estimated Cost automatically, no link needed.
  const needsExplicitLink = needsExplicitDocumentLink(sheets.length, projectQuotes.length);
  const linkedQuote = projectQuotes.find((q) => q.material_sheet_id === sheetId);
  const [linkQuoteOpen, setLinkQuoteOpen] = useState(false);

  const linkQuoteMut = useMutation({
    mutationFn: (quoteId: string) => linkQuoteToMaterialSheet(quoteId, sheetId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const unlinkQuoteMut = useMutation({
    mutationFn: (quoteId: string) => linkQuoteToMaterialSheet(quoteId, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const renameSheetMut = useMutation({
    mutationFn: (name: string) => updateMaterialsSheet(sheetId!, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const navigate = useNavigate();
  const addSheetMut = useMutation({
    mutationFn: () => createMaterialsSheet(projectId, { name: "New materials sheet" }),
    onSuccess: (sheet) => {
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      navigate(`/projects/${projectId}/materials/${sheet.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const deleteSheetMut = useMutation({
    mutationFn: () => deleteMaterialsSheet(sheetId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Materials sheet deleted" });
      navigate(`/projects/${projectId}/materials`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const currentSheet = sheets.find((s) => s.id === sheetId);
  const [nameDraft, setNameDraft] = useState(currentSheet?.name ?? "");
  useEffect(() => setNameDraft(currentSheet?.name ?? ""), [currentSheet?.name]);

  const grandTotal = useMemo(
    () =>
      draft.reduce(
        (sum, s) => sum + s.items.reduce((a, i) => a + materialsLineTotal(i), 0),
        0,
      ),
    [draft],
  );

  // Track / Don't Track (0086) — live off the draft (not the server rows)
  // so the count updates the instant the contractor toggles an item, same
  // as every other field on this page.
  const draftItems = useMemo(() => draft.flatMap((s) => s.items), [draft]);
  const itemTrackingSummary = useMemo(() => trackingSummary(draftItems), [draftItems]);
  const setAllTracked = (tracked: boolean) =>
    edit((d) => d.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, tracked })) })));

  const isDirty = dirty.current;

  return (
    <div className={cn("mx-auto max-w-4xl animate-fade-in space-y-5", isDirty && "pb-40 md:pb-28")}>
      <BackLink
        to={backHref}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >{backLabel}</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {needsExplicitLink && sheetId ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim() || "Materials sheet";
                setNameDraft(trimmed);
                if (trimmed !== currentSheet?.name) renameSheetMut.mutate(trimmed);
              }}
              className="h-auto border-none bg-transparent px-0 text-2xl font-bold tracking-tight text-foreground shadow-none focus-visible:ring-0 md:text-[28px]"
              aria-label="Sheet name"
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[28px]">Materials sheet</h1>
          )}
          <p className="mt-1 text-muted-foreground">{projectName ?? " "}</p>
          <GoToProjectLink projectId={projectId} isDirty={isDirty} className="mt-1.5" />
        </div>
        {/* Phones: the header's secondary actions live in "⋯". */}
        {sheetId && (
          <ActionMenu
            className="-mr-2 md:hidden"
            title="Materials sheet"
            ariaLabel="Sheet actions"
            items={[
              {
                label: "Generate order sheet",
                icon: FileDown,
                onSelect: () => setOrderSheetOpen(true),
                disabled: sections.every((s) => s.materials_items.length === 0),
              },
              { label: "Add another materials sheet", icon: Plus, onSelect: () => addSheetMut.mutate() },
              ...(sheets.length > 1
                ? [{ label: "Delete sheet", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteSheetOpen(true) }]
                : []),
            ]}
          />
        )}
        {sheetId && (
          <div className="hidden max-w-full flex-wrap items-center gap-3 md:flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOrderSheetOpen(true)}
              disabled={sections.every((s) => s.materials_items.length === 0)}
              className="font-bold"
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Generate Order Sheet
            </Button>
            <button
              type="button"
              onClick={() => addSheetMut.mutate()}
              disabled={addSheetMut.isPending}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              + Add another materials sheet
            </button>
            {sheets.length > 1 && (
              <button
                type="button"
                onClick={() => setDeleteSheetOpen(true)}
                className="text-xs font-medium text-muted-foreground hover:text-destructive"
              >
                Delete sheet
              </button>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={deleteSheetOpen} onOpenChange={setDeleteSheetOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{currentSheet?.name || "this sheet"}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Removes this sheet and all its sections/items.
                      {linkedQuote ? " Its linked quote's Estimated Cost will show \"Not available\" again." : ""}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteSheetMut.mutate()}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
      </AlertDialog>

      {/* Quote link stays up top; the total itself lives at the bottom,
          after every section. */}
      {needsExplicitLink && sheetId && (
        <div className="overflow-hidden rounded-card shadow-card">
          <LinkedDocumentBar
            targetLabel="quote"
            linked={
              linkedQuote
                ? { label: `Linked to ${formatCurrency(quoteTotal(linkedQuote.quote_sections))} quote` }
                : null
            }
            onLink={() => setLinkQuoteOpen(true)}
            onUnlink={() => unlinkQuoteMut.mutate(linkedQuote!.id)}
            className="bg-sidebar/95"
          />
        </div>
      )}

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
            {costSummary.notOrderedCount > 0 && (
              <span className="badge-status badge-pending">{pluralize(costSummary.notOrderedCount, "line")} not ordered</span>
            )}
            {costSummary.overEstimateCount > 0 && (
              <span className="badge-status badge-overdue">{pluralize(costSummary.overEstimateCount, "line")} over estimate</span>
            )}
            {costSummary.unplannedCount > 0 && (
              <span className="badge-status badge-pending">{pluralize(costSummary.unplannedCount, "unplanned item")}</span>
            )}
          </div>
        </div>
      )}

      {itemTrackingSummary.totalCount > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Tracking <span className="font-bold text-foreground">{itemTrackingSummary.trackedCount}</span> of{" "}
            {itemTrackingSummary.totalCount} materials
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="tap-target text-xs font-bold text-primary hover:underline">
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

      {isLoading && <p className="text-muted-foreground">Loading materials sheet…</p>}
      {isError && <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>}

      {!isLoading && !isError && draft.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          Add a section to get started.
        </div>
      )}

      {draft.length > 0 && (
        <div className="flex items-center justify-end gap-3 text-xs font-bold text-primary">
          <button
            type="button"
            onClick={() => collapseAll(draft.map((s) => s.id))}
            className="tap-target hover:underline"
          >
            Collapse all
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => expandAll(draft.map((s) => s.id))}
            className="tap-target hover:underline"
          >
            Expand all
          </button>
        </div>
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
              {draft.map((section, index) => (
                <Draggable key={section.id} draggableId={section.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
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
                        onDelete={() => deleteSection(section.id)}
                        onAddItem={() => addItem(section.id)}
                        onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
                        onDeleteItem={(iid) => deleteItem(section.id, iid)}
                        onApplyCalculatedLines={(lines) => applyCalculatedLines(section.id, lines)}
                        dragHandleProps={dragProvided.dragHandleProps}
                        dragging={dragSnapshot.isDragging}
                        canMoveUp={index > 0}
                        canMoveDown={index < draft.length - 1}
                        onMoveUp={() => moveSection(index, -1)}
                        onMoveDown={() => moveSection(index, 1)}
                        onMoveItem={(itemIndex, direction) => moveItem(section.id, itemIndex, direction)}
                        collapsed={isCollapsed(section.id)}
                        onToggleCollapse={() => toggleCollapse(section.id)}
                        isDraggingItem={isDraggingItem}
                        onAutoExpand={() => expandSection(section.id)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {isTracked && deliveries.some((d) => d.item.materials_item_id == null) && (
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

      {/* Sheet total — after all sections. */}
      <div className="flex items-center justify-between overflow-hidden rounded-card border-2 border-primary bg-sidebar px-5 py-4 shadow-card">
        <span className="text-[11px] font-bold uppercase tracking-wide text-background/55">
          Total cost · {pluralize(draft.length, "section")}
        </span>
        <span className="text-[26px] font-extrabold tracking-tight tabular-nums text-background">
          {formatCurrency(grandTotal)}
        </span>
      </div>

      <BuilderActionBar
        isDirty={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        figureLabel="Sheet total"
        figure={formatCurrency(grandTotal)}
        breakdownTitle="Sheet total"
        breakdown={
          <div>
            {draft.map((s) => (
              <BreakdownRow
                key={s.id}
                label={<span className="block max-w-[14rem] truncate">{s.name || "Untitled section"}</span>}
                value={formatCurrency(s.items.reduce((a, i) => a + materialsLineTotal(i), 0))}
              />
            ))}
            <BreakdownRow strong label="Total cost" value={formatCurrency(grandTotal)} />
          </div>
        }
        primaryAction={
          sheetId
            ? {
                label: "Order sheet",
                onClick: () => setOrderSheetOpen(true),
                disabled: sections.every((s) => s.materials_items.length === 0),
              }
            : undefined
        }
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
        sections={sections}
        catalogItems={catalogItems}
        priceBookItems={priceBookItems}
      />

      {needsExplicitLink && sheetId && (
        <LinkQuoteDialog
          open={linkQuoteOpen}
          onOpenChange={setLinkQuoteOpen}
          quotes={projectQuotes}
          onSelect={(quoteId) => linkQuoteMut.mutate(quoteId)}
        />
      )}

      {logUsageLine && (
        <LogUsageDialog
          open={!!logUsageLine}
          onOpenChange={(open) => !open && setLogUsageLine(null)}
          line={logUsageLine}
        />
      )}

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

function LinkQuoteDialog({
  open,
  onOpenChange,
  quotes,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotes: Quote[];
  onSelect: (quoteId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Link a quote</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {quotes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No quotes on this project yet.
            </p>
          ) : (
            quotes.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onSelect(q.id);
                  onOpenChange(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 pl-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(quoteTotal(q.quote_sections))}
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill meta={quoteStatusMeta(q.status)} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/** Material budget tracking (0080) — bundled so it's one new prop at every
 * layer instead of five. byItemId is empty (not present at all) for an
 * untracked sheet, so every row below just checks `tracking.byItemId.get
 * (item.id)` and renders nothing extra when it's undefined. */
interface TrackingContext {
  byItemId: Map<string, { estimated: number; ordered: number; delivered: number; used: number; status: LineStatus; unit: string | null }>;
  onLogUsage: (itemId: string) => void;
  onMarkFullyUsed: (itemId: string) => void;
  onReviseEstimate: (itemId: string) => void;
}

interface SectionCardProps {
  section: DraftSection;
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
  onAddItem: () => void;
  onEditItem: (itemId: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onApplyCalculatedLines: (lines: CalculatedLine[]) => void;
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
  onEditItem,
  onDeleteItem,
  onApplyCalculatedLines,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onMoveItem,
  collapsed,
  onToggleCollapse,
  isDraggingItem,
  onAutoExpand,
}: SectionCardProps) {
  const subtotal = section.items.reduce((a, i) => a + materialsLineTotal(i), 0);
  const buildType = findSmartSectionTemplate(section.smart_section_build_type);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  // View order only — the saved manual order is untouched unless the user
  // reorders while sorted (the page handles that; see reorderFromSorted).
  const displayItems = sortItemsByCost(section.items, sortMode);

  return (
    <SectionCard
      name={section.name}
      onRename={onRename}
      subtotal={subtotal}
      itemNames={displayItems.map((i) => materialLineLabel(i))}
      tag={
        <ProjectTypeChip
          value={section.job_category_id}
          options={projectTypeOptions}
          allCategories={jobCategories}
          onChange={onTypeChange}
        />
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
      secondRow={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-3 py-2 sm:px-5 sm:py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {buildType && (
              <button
                type="button"
                onClick={() => setCalculatorOpen(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <Calculator className="h-4 w-4" />
                Calculate quantities
              </button>
            )}
            {section.items.length > 1 && (
              <SheetSelect
                value={sortMode}
                onValueChange={(v) => onSortChange(v as ItemSortMode)}
                title="Sort line items"
                ariaLabel="Sort line items"
                options={[
                  { value: "manual", label: "Manual order" },
                  { value: "cost_desc", label: "Cost: high → low" },
                  { value: "cost_asc", label: "Cost: low → high" },
                ]}
                triggerClassName="h-9 w-auto gap-1.5 rounded-lg border-none bg-muted px-2.5 text-xs font-semibold sm:h-8"
              />
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="tap-target flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete section
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {section.items.length > 0
                    ? `Removes ${section.items.length} item${section.items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)} from the sheet. Nothing is saved until you press Save changes.`
                    : "This section is empty."}
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
        </div>
      }
    >
      <Droppable droppableId={section.id} type="item">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
            {displayItems.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
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
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {/* The section's primary action — tinted and solid-bordered so it
          stands apart from Calculate quantities / Delete section. */}
      <button
        type="button"
        onClick={onAddItem}
        className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-primary/40 bg-primary/5 text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        Add line item
      </button>

      {buildType && (
        <SmartSectionCalculatorDialog
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          template={buildType}
          catalogItems={catalogItems}
          onApply={onApplyCalculatedLines}
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
  const track = tracking.byItemId.get(item.id);
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
        "group flex flex-col gap-3 rounded-2xl border border-hairline p-3 transition-shadow sm:gap-3.5 sm:p-4 hover:border-input hover:shadow-card-hover",
        dragging && "border-primary/40 opacity-90 shadow-card-hover",
      )}
    >
      {/* Item name + price book picker + handle/arrows + delete — the
          label sits on its own line above; the input and every button
          share one row so they center on the input itself (not the
          label+input block), independent of everything below (category,
          qty/cost fields). */}
      {/* sm+: "ITEM" label on its own line, then name · Price Book · Tracked ·
          reorder · delete on one line. Phones: label (+ linked / not-tracked
          hints) and a "⋯" menu holding every secondary control on top, then
          the full-width name (+ color under it). The reorder controls stay
          mounted (hidden) on phones — the drag handle can only exist once,
          and dragging is desktop-only. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:-mb-1 sm:basis-full">
          <span className={ITEM_FIELD_LABEL}>Item</span>
          {(linked || catalogLinked) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary sm:hidden">
              <BookOpen className="h-3 w-3" />
              {catalogLinked ? "Catalog" : "Price Book"}
            </span>
          )}
          {!item.tracked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground sm:hidden">
              <EyeOff className="h-3 w-3" />
              Not tracked
            </span>
          )}
        </div>
        <ActionMenu
          className="-my-2 -mr-2 sm:hidden"
          title={item.name || "Line item"}
          ariaLabel="Line item actions"
          items={[
            { label: "Move up", icon: ChevronUp, onSelect: onMoveUp, disabled: !canMoveUp },
            { label: "Move down", icon: ChevronDown, onSelect: onMoveDown, disabled: !canMoveDown },
            { label: "Pick from Price Book / Catalog", icon: BookOpen, onSelect: () => setPickerOpen(true), separatorBefore: true },
            item.tracked
              ? { label: "Stop tracking in Material Tracker", icon: EyeOff, onSelect: () => onEdit({ tracked: false }) }
              : { label: "Track in Material Tracker", icon: Eye, onSelect: () => onEdit({ tracked: true }) },
            { label: "Remove item", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true },
          ]}
        />
        <div className="flex min-w-0 basis-full flex-col gap-2 sm:flex-1 sm:basis-auto sm:flex-row sm:items-center">
            <AutoGrowTextarea
              value={item.name}
              onChange={(e) => onEdit({ name: e.target.value })}
              placeholder="Item name"
              // flex-1 only when the row is horizontal (sm+) — in the phone's
              // column layout it would pin the height and clip wrapped names.
              className="min-w-0 rounded-xl bg-muted px-3 py-2 text-base font-semibold hover:border-input focus-visible:border-primary sm:flex-1 sm:text-[15px]"
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
              "hidden h-[30px] min-w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors sm:flex",
              linked || catalogLinked
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "text-muted-subtle hover:bg-primary/10 hover:text-primary",
            )}
            aria-label="Pick from Price Book or Catalog"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>Price Book</span>
          </button>
          <button
            type="button"
            onClick={() => onEdit({ tracked: !item.tracked })}
            className={cn(
              "hidden h-[30px] min-w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition-colors sm:flex",
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
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
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
        <div className="mt-1">
          <SheetSelect
            value={item.material_category_id ?? NONE}
            onValueChange={(v) => onEdit({ material_category_id: v === NONE ? null : v })}
            options={[{ value: NONE, label: "Uncategorized" }, ...materialCategories.map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="Uncategorized"
            title="Category"
            ariaLabel="Category"
            triggerClassName="h-11 sm:h-[42px]"
          />
        </div>
      </div>

      {/* Qty · Unit / Waste % · Unit cost two-up on phones with Total on its
          own right-aligned row; five-up from sm. */}
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
            className="mt-1 h-11 tabular-nums sm:h-[42px]"
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
            className="mt-1 h-11 tabular-nums sm:h-[42px]"
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
            className="mt-1 h-11 tabular-nums sm:h-[42px]"
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
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 py-2.5 sm:col-span-1 sm:block sm:rounded-none sm:bg-transparent sm:p-0">
          <div className={ITEM_FIELD_LABEL}>Total</div>
          <div className="text-lg font-extrabold tabular-nums text-success sm:mt-1 sm:flex sm:h-[42px] sm:items-center sm:justify-end sm:rounded-md sm:bg-primary/10 sm:px-3 sm:text-base">
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
              className="tap-target font-semibold text-primary hover:underline"
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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a material"
      desktopClassName="flex max-h-[80vh] max-w-md flex-col gap-3"
    >
        {/* Phones: a fixed-height sheet so the search stays put and only the list scrolls. */}
        <Tabs defaultValue="price-book" className="flex h-[65dvh] min-h-0 flex-1 flex-col md:h-auto">
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
    </ResponsiveDialog>
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


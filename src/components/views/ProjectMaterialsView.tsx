import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { StatusPill } from "@/components/common/StatusPill";
import { ReorderControls } from "@/components/common/ReorderControls";
import { LinkedDocumentBar } from "@/components/common/LinkedDocumentBar";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { useSectionReorder } from "@/hooks/use-section-reorder";
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
  type MaterialsSection,
  type MaterialsSheet,
  type Quote,
  type ExpenseCategory,
  type PriceBookItem,
  type ProductCatalogItem,
  type CatalogPriceOverride,
} from "@/lib/api";
import { SmartSectionDialog } from "@/components/materials/SmartSectionDialog";
import { SmartSectionCalculatorDialog } from "@/components/materials/SmartSectionCalculatorDialog";
import { CatalogPicker } from "@/components/materials/CatalogPicker";
import { findSmartSectionTemplate, type CalculatedLine } from "@/lib/smartSections";
import { nextOrderableQuantity } from "@/lib/catalogOrdering";

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
  /** Free-text unit of measure (sf, cy, bag, lf, ea…). Not part of the math. */
  unit: string;
  /** Set when this line was picked from the Price Book — locks
   * expense_category_id in the UI. Null = a normal custom line (or a pick
   * that's since been unlinked). */
  price_book_item_id: string | null;
  /** Set when this line was picked from the Product Catalog instead — a
   * line is ever linked to at most one of price_book_item_id /
   * catalog_product_id, never both. */
  catalog_product_id: string | null;
  /** Reference-only, every line regardless of source — not part of the
   * quantity*unit_cost math. */
  waste_percent: number;
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
  items: DraftItem[];
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const seed = (sections: MaterialsSection[]): DraftSection[] =>
  sections.map((s) => ({
    id: s.id,
    name: s.name,
    smart_section_build_type: s.smart_section_build_type ?? null,
    items: s.materials_items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
      expense_category_id: i.expense_category_id ?? null,
      unit: i.unit ?? "",
      price_book_item_id: i.price_book_item_id ?? null,
      catalog_product_id: i.catalog_product_id ?? null,
      waste_percent: Number(i.waste_percent ?? 0),
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
    unit: string;
    price_book_item_id: string | null;
    catalog_product_id: string | null;
    waste_percent: number;
  },
) =>
  a.name !== b.name ||
  a.quantity !== b.quantity ||
  a.unit_cost !== b.unit_cost ||
  a.expense_category_id !== b.expense_category_id ||
  a.unit !== b.unit ||
  a.price_book_item_id !== b.price_book_item_id ||
  a.catalog_product_id !== b.catalog_product_id ||
  a.waste_percent !== b.waste_percent;

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
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });

  return (
    <MaterialsSheetBuilder
      projectId={id}
      projectName={project?.name}
      sheetId={sheetId}
      backHref={`/projects/${id}/materials`}
      backLabel="Back to materials sheets"
    />
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
      <Link
        to={`/projects/${projectId}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

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

function MaterialsSheetBuilder({ projectId, projectName, sheetId, backHref, backLabel }: MaterialsSheetBuilderProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sections = [], isLoading, isError, error } = useQuery({
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

  const [draft, setDraft] = useState<DraftSection[]>([]);
  const [smartSectionOpen, setSmartSectionOpen] = useState(false);
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
  const { moveSection, moveItem, onDragEnd } = useSectionReorder<DraftItem, DraftSection>(edit);

  const discard = () => {
    dirty.current = false;
    setDraft(seed(sections));
  };

  // --- local mutators -------------------------------------------------------
  const renameSection = (sid: string, name: string) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, name } : s)));
  const deleteSection = (sid: string) => edit((d) => d.filter((s) => s.id !== sid));
  const addSection = () =>
    edit((d) => [...d, { id: tmpId(), name: "", smart_section_build_type: null, items: [] }]);
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
        items: lineItems.map((itemName) => ({
          id: tmpId(),
          name: itemName,
          quantity: 0,
          unit_cost: 0,
          expense_category_id: null,
          unit: "",
          price_book_item_id: null,
          catalog_product_id: null,
          waste_percent: 0,
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
            const patch: Partial<DraftItem> = { quantity: line.quantity, unit: line.unit };
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
                  unit: "",
                  price_book_item_id: null,
                  catalog_product_id: null,
                  waste_percent: 0,
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
          });
          sectionId = created.id;
        } else if (server.name !== name || server.sort_order !== si) {
          await updateMaterialsSection(server.id, { name, sort_order: si });
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
          if (!srv) {
            await addMaterialsItem(sectionId, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              sort_order: ii,
              expense_category_id: di.expense_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
            });
          } else if (
            itemChanged(di, {
              name: srv.name,
              quantity: Number(srv.quantity),
              unit_cost: Number(srv.unit_cost),
              expense_category_id: srv.expense_category_id ?? null,
              unit: srv.unit ?? "",
              price_book_item_id: srv.price_book_item_id ?? null,
              catalog_product_id: srv.catalog_product_id ?? null,
              waste_percent: Number(srv.waste_percent ?? 0),
            }) ||
            srv.sort_order !== ii
          ) {
            await updateMaterialsItem(srv.id, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              expense_category_id: di.expense_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
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
        (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0),
        0,
      ),
    [draft],
  );

  const isDirty = dirty.current;

  return (
    <div className={cn("mx-auto max-w-4xl animate-fade-in space-y-5", isDirty && "pb-40 md:pb-28")}>
      <Link
        to={backHref}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>

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
              className="h-auto border-none bg-transparent px-0 text-[28px] font-bold tracking-tight text-foreground shadow-none focus-visible:ring-0"
              aria-label="Sheet name"
            />
          ) : (
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">Materials sheet</h1>
          )}
          <p className="mt-1 text-muted-foreground">{projectName ?? " "}</p>
          <GoToProjectLink projectId={projectId} isDirty={isDirty} className="mt-1.5" />
        </div>
        {sheetId && (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => addSheetMut.mutate()}
              disabled={addSheetMut.isPending}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              + Add materials sheet
            </button>
            {sheets.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    Delete sheet
                  </button>
                </AlertDialogTrigger>
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
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-background/55">
            Total cost
          </span>
          <span className="text-[26px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(grandTotal)}
          </span>
        </div>
        {needsExplicitLink && sheetId && (
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
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading materials sheet…</p>}
      {isError && <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>}

      {!isLoading && !isError && draft.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          Add a section to get started.
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="materials-sections" type="section">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-5">
              {draft.map((section, index) => (
                <Draggable key={section.id} draggableId={section.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <SectionCard
                        section={section}
                        expenseCategories={expenseCategories}
                        priceBookItems={priceBookItems}
                        catalogItems={catalogItems}
                        priceOverrides={priceOverrides}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={addSection}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border bg-card text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add section
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

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
      />

      <SmartSectionDialog
        open={smartSectionOpen}
        onOpenChange={setSmartSectionOpen}
        onCreate={addSmartSection}
      />

      {needsExplicitLink && sheetId && (
        <LinkQuoteDialog
          open={linkQuoteOpen}
          onOpenChange={setLinkQuoteOpen}
          quotes={projectQuotes}
          onSelect={(quoteId) => linkQuoteMut.mutate(quoteId)}
        />
      )}
    </div>
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

interface SectionCardProps {
  section: DraftSection;
  expenseCategories: ExpenseCategory[];
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
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
}

function SectionCard({
  section,
  expenseCategories,
  priceBookItems,
  catalogItems,
  priceOverrides,
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
}: SectionCardProps) {
  const subtotal = section.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0);
  const buildType = findSmartSectionTemplate(section.smart_section_build_type);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow",
        dragging && "opacity-90 shadow-card-hover",
      )}
    >
      {/* Slate section header — editable name + running subtotal */}
      <div className="group flex items-center gap-3 bg-sidebar px-5 py-4">
        <input
          value={section.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="New section"
          className="-ml-2.5 min-w-0 flex-1 rounded-lg border-none bg-transparent px-2.5 py-1 text-[19px] font-bold tracking-tight text-background outline-none transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary"
        />
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-background/55">{pluralize(section.items.length, "item")}</div>
          <div className="mt-0.5 text-[19px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(subtotal)}
          </div>
        </div>
        <ReorderControls
          tone="dark"
          dragHandleProps={dragHandleProps}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          label={section.name || "section"}
        />
      </div>

      {/* Calculator (Smart Sections only) + Delete */}
      <div className="flex items-center justify-between border-b border-hairline px-5 py-2.5">
        {buildType ? (
          <button
            type="button"
            onClick={() => setCalculatorOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <Calculator className="h-4 w-4" />
            Calculate quantities
          </button>
        ) : (
          <span />
        )}
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

      {/* Items */}
      <div className="p-[18px]">
        <Droppable droppableId={section.id} type="item">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
              {section.items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <ItemRow
                        item={item}
                        expenseCategories={expenseCategories}
                        priceBookItems={priceBookItems}
                        catalogItems={catalogItems}
                        priceOverrides={priceOverrides}
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
        <button
          type="button"
          onClick={onAddItem}
          className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add item to this section
        </button>
      </div>

      {buildType && (
        <SmartSectionCalculatorDialog
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          template={buildType}
          catalogItems={catalogItems}
          onApply={onApplyCalculatedLines}
        />
      )}
    </div>
  );
}

const ITEM_FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

interface ItemRowProps {
  item: DraftItem;
  expenseCategories: ExpenseCategory[];
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
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
  expenseCategories,
  priceBookItems,
  catalogItems,
  priceOverrides,
  onEdit,
  onDelete,
  dragHandleProps,
  dragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: ItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [costStr, setCostStr] = useState(String(item.unit_cost));
  const [wasteStr, setWasteStr] = useState(String(item.waste_percent));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setCostStr(String(item.unit_cost)), [item.unit_cost]);
  useEffect(() => setWasteStr(String(item.waste_percent)), [item.waste_percent]);
  useEffect(() => setNudgeDismissed(false), [item.quantity, item.catalog_product_id]);

  const total = item.quantity * item.unit_cost;
  const linked = item.price_book_item_id != null;
  const catalogProduct = catalogItems.find((c) => c.id === item.catalog_product_id);
  const catalogLinked = catalogProduct != null;
  const linkedCategoryName =
    expenseCategories.find((c) => c.id === item.expense_category_id)?.name ?? "Uncategorized";

  const applyPick = (pbi: PriceBookItem) => {
    onEdit({
      name: pbi.name,
      unit: pbi.unit ?? "",
      unit_cost: Number(pbi.unit_price),
      expense_category_id: pbi.expense_category_id,
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
      unit: product.unit ?? "",
      unit_cost: override?.price ?? 0,
      price_book_item_id: null,
      catalog_product_id: product.id,
      rememberPrice: false,
    });
    setPickerOpen(false);
  };

  const orderableQty = catalogLinked
    ? nextOrderableQuantity(item.quantity, catalogProduct?.specs)
    : null;

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
      <div>
        <div className={ITEM_FIELD_LABEL}>Item</div>
        <div className="mt-1 flex items-center gap-3">
          <AutoGrowTextarea
            value={item.name}
            onChange={(e) => onEdit({ name: e.target.value })}
            placeholder="Item name"
            className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-[15px] font-semibold hover:border-input focus-visible:border-primary"
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg transition-colors",
              linked || catalogLinked
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "text-muted-subtle hover:bg-primary/10 hover:text-primary",
            )}
            aria-label="Pick from Price Book or Catalog"
          >
            <BookOpen className="h-4 w-4" />
          </button>
          <ReorderControls
            dragHandleProps={dragHandleProps}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            label={item.name || "item"}
            className="mr-2"
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

      {/* Category — its own full-width row so the picked name is never
          truncated/clipped on mobile. Locked (read-only) once this line is
          linked to a Price Book item — that's what's meant to keep cost
          categorization consistent; unlink to edit it directly again. */}
      <div>
        <div className="flex items-center justify-between">
          <div className={ITEM_FIELD_LABEL}>Category</div>
          {linked && (
            <button
              type="button"
              onClick={() => onEdit({ price_book_item_id: null })}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Unlink
            </button>
          )}
        </div>
        {linked ? (
          <div className="mt-1 flex h-[42px] items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-subtle" />
            <span className="truncate">{linkedCategoryName}</span>
          </div>
        ) : (
          <Select
            value={item.expense_category_id ?? NONE}
            onValueChange={(v) => onEdit({ expense_category_id: v === NONE ? null : v })}
          >
            <SelectTrigger className="mt-1 h-[42px]" aria-label="Category">
              <SelectValue placeholder="Uncategorized" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Uncategorized</SelectItem>
              {expenseCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
          {orderableQty != null && !nudgeDismissed && (
            <div className="mt-1.5 flex items-start justify-between gap-1.5 rounded-md bg-warning/15 px-2 py-1.5 text-[11px] leading-snug text-warning">
              <span>
                {item.quantity} {item.unit || "units"} required · next orderable quantity:{" "}
                {orderableQty} {item.unit || "units"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setQtyStr(String(orderableQty));
                    onEdit({ quantity: orderableQty });
                  }}
                  className="font-bold text-primary hover:underline"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setNudgeDismissed(true)}
                  aria-label="Dismiss"
                  className="text-muted-subtle hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit</div>
          <Input
            value={item.unit}
            onChange={(e) => onEdit({ unit: e.target.value })}
            placeholder="sf, cy, bag…"
            className="mt-1 h-[42px]"
            aria-label="Unit"
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


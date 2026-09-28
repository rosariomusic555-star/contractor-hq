import { useEffect, useRef, useState, type ReactNode, useMemo } from "react";
import { costPlanHasEntries, costPlanTotal, sumSectionTotals } from "@/lib/costPlanMath";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Share2,
  Briefcase,
  Copy,
  Sparkles,
  Layers,
  Pencil,
  ArrowRight,
  ListChecks,
  BookmarkPlus,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { QuoteApprovalRow } from "@/components/quotes/QuoteApprovalRow";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { SectionTypeChip } from "@/components/common/SectionTypeChip";
import { QuoteSectionSelections } from "@/components/selections/QuoteSectionSelections";
import { QuoteActivityLine } from "@/components/quote-activity/QuoteActivityLine";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { groupCost, groupFromRows, sectionIncluded, selectionRange, selectionsTotal } from "@/lib/selections";
import { SectionToolbarAction } from "@/components/common/SectionToolbarAction";
import { useMeasurementPrefill } from "@/hooks/use-measurement-prefill";
import type { SectionFeaturePicker } from "@/components/common/SectionNameField";
import { featureName, liveFeatures } from "@/lib/features";
import { addonQuoteNumbers } from "@/lib/featureFinancials";
import {
  TRUE_COST_STATUS_CLASS,
  averageLaborRate,
  burdenPerHour,
  formatLabor,
  lumpSumsWithoutHours,
  plannedManHours,
  trueCost,
  type OverheadSettings,
} from "@/lib/overhead";
import { SetUpOverheadLink, TrueCostSummary } from "@/components/overhead/TrueCostCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  categoryForSectionName, categoryIdForBuildType,
  sectionFeatureOptions,
  featurePickerOptions,
  withCommittedSectionName,
  withSectionType,
  type SectionFeatureOption,
} from "@/lib/sectionFeatures";
import {
  autoMatchedSheetSections,
  linkedSheetSections as linkedSheetSectionsFor,
  sectionMargin,
  sheetSectionsCost,
} from "@/lib/quoteSectionMaterials";
import { ReorderControls } from "@/components/common/ReorderControls";
import { LineItemSectionCard } from "@/components/common/LineItemSectionCard";
import { revokeLocalImageUrls, type DraftLineImage } from "@/lib/draftLineItem";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { useSectionReorder } from "@/hooks/use-section-reorder";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { CollapseAllLinks } from "@/components/common/CollapseAllLinks";
import { quoteStatusMeta } from "@/lib/statusMeta";
import { demoQuoteTerms, type DemoQuoteTerms } from "@/lib/demoData";
import { compressImageFile } from "@/lib/imageUpload";
import {
  listClients,
  listProjects,
  listMaterials,
  listMaterialsSheets,
  listProjectFeatures,
  getOverheadSettings,
  createProjectFeature,
  ensureFeatureSections,
  listMaterialsBySheet,
  listQuotes,
  listCategories,
  updateQuote,
  addQuoteSection,
  updateQuoteSection,
  setQuoteSectionMaterialLinks,
  type MaterialsSection,
  getProject,
  projectCategoryIds,
  deleteQuoteSection,
  addQuoteItem,
  updateQuoteItem,
  deleteQuoteItem,
  uploadQuoteItemImage,
  deleteQuoteItemImage,
  getSignedImageUrls,
  generateShareLink,
  logProjectEvent,
  getQuoteDefaults,
  saveQuoteDefaults,
  QUOTE_DEFAULTS_FALLBACK,
  listProductCatalog,
  listQuickQuoteRates,
  getOpportunityByQuoteId,
  advanceStageOnQuoteSent,
  type Quote,
  type Category,
  snapshotDocument,
  listSelectionTemplates,
  type SelectionGroupDraft,
} from "@/lib/api";
import { QuickQuoteDialog } from "@/components/quotes/QuickQuoteDialog";
import { QuickQuoteFormDialog, type QuickQuoteResult } from "@/components/quotes/QuickQuoteFormDialog";
import { findQuickQuoteTemplate } from "@/lib/quickQuote";
import { buildTypeForCategoryName } from "@/lib/measurements";
import { BackLink } from "@/components/common/BackLink";
import { remapDraftIds } from "@/lib/draftRemap";
import { depositAmount as depositAmountOf } from "@/lib/projectMoney";

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Draft model — the whole quote body (sections, items, notes, terms, deposit)
// is edited locally and only written to Supabase when "Save changes" is
// pressed. New rows get a "tmp-" id. Mirrors ProjectMaterialsView. The Client
// and Link-to-project selects are NOT part of the draft — they save on change.
// ---------------------------------------------------------------------------

// DraftImage's shape (and the discard-safety invariant it exists for) now
// lives in LineItemRow.tsx as DraftLineImage, shared with the Change Order
// builder — aliased locally so the rest of this file doesn't need renaming.
type DraftImage = DraftLineImage;
interface DraftItem {
  id: string;
  name: string;
  description: string;
  /** Unit price. Line total = quantity × price. */
  price: number;
  quantity: number;
  /** Unit of measure label (sf, cy, ea…). Not part of the math. */
  unit: string;
  is_optional: boolean;
  /** Set by the client on the share page; carried through, never edited here. */
  client_selected: boolean;
  /** Optional work category (Settings > Categories). Null = uncategorized. */
  category_id: string | null;
  /** The line a section's Quick Quote produced (0102) — its build type.
   * Re-running Quick Quote on the section updates this line in place. */
  quick_quote_build_type: string | null;
  images: DraftImage[];
}
interface DraftSection {
  id: string;
  name: string;
  is_optional: boolean;
  /** Project-type tag (0095) — same chip as materials sheet sections. */
  job_category_id: string | null;
  /** The project feature this section prices (0105) — its cost is that
   * feature's Cost plan section. Null on standalone quotes / non-feature
   * sections. */
  feature_id: string | null;
  /** Picked "new feature of this type" — the feature is created on Save. */
  new_feature_category_id?: string | null;
  /** How this section's materials are found (0095): 'auto' = matched live
   * by project type / name; 'manual' = materialIds. */
  materials_link_mode: "auto" | "manual";
  /** Manual picks — materials sheet section ids (only used when manual). */
  materialIds: string[];
  items: DraftItem[];
}
interface QuoteDraft {
  sections: DraftSection[];
  notes: string;
  terms: string;
  depositPct: number;
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const seed = (quote: Quote): QuoteDraft => ({
  sections: quote.quote_sections.map((s) => ({
    id: s.id,
    name: s.name,
    is_optional: s.is_optional,
    job_category_id: s.job_category_id ?? null,
    feature_id: s.feature_id ?? null,
    materials_link_mode: s.materials_link_mode ?? "auto",
    materialIds: (s.quote_section_material_links ?? []).map((l) => l.materials_section_id),
    items: s.quote_items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? "",
      price: Number(i.price),
      quantity: i.quantity == null ? 1 : Number(i.quantity),
      unit: i.unit ?? "",
      is_optional: i.is_optional,
      client_selected: i.client_selected,
      category_id: i.category_id ?? null,
      quick_quote_build_type: i.quick_quote_build_type ?? null,
      images: (i.quote_item_images ?? []).map((img) => ({
        id: img.id,
        storage_path: img.storage_path,
        file: null,
        previewUrl: null,
        sort_order: img.sort_order,
      })),
    })),
  })),
  notes: quote.notes ?? "",
  terms: quote.terms ?? "",
  depositPct: Number(quote.deposit_percentage),
});

/** Line total = quantity × unit price. */
const lineTotal = (i: DraftItem) => i.price * i.quantity;
/** An item is an "optional add-on" if its section or the item itself is flagged. */
const itemIsAddon = (s: DraftSection, i: DraftItem) => s.is_optional || i.is_optional;
/** A section's base (non-optional) subtotal — what always counts toward the
 * base/required total, regardless of client_selected (that field reflects
 * what the client has picked on the live page so far — irrelevant while
 * drafting/previewing, where every optional item should count toward the
 * "optional" figure unconditionally, not just the ones already picked). */
const baseSubtotal = (s: DraftSection) =>
  s.is_optional ? 0 : s.items.reduce((sum, i) => (i.is_optional ? sum : sum + lineTotal(i)), 0);

interface QuoteWorkspaceProps {
  quote: Quote;
  /** Where "Back to ..." goes and what it's labeled — the only thing that
   * differs between reaching this from a project vs. from the quotes list. */
  backHref: string;
  backLabel: string;
}

/**
 * The full quote editor — client/project linking, sections/items, totals /
 * margin panel, notes/terms/deposit, send flow. Single place all quote
 * configuration happens, whether the quote started standalone or from a
 * project: project_id/client_id are derived straight from `quote`.
 */
export function QuoteWorkspace({ quote, backHref, backLabel }: QuoteWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirmApprovedSaveOpen, setConfirmApprovedSaveOpen] = useState(false);
  const [quickQuotePickerOpen, setQuickQuotePickerOpen] = useState(false);
  const [quickQuoteBuildType, setQuickQuoteBuildType] = useState<string | null>(null);
  // Set right before triggering a save from the "Create project" nudge, so
  // whatever's currently in the editor — saved or not — is what actually
  // gets moved into the new project, instead of re-parenting whatever was
  // last persisted to the DB. Consumed (and cleared) in saveMut's
  // onSuccess; also cleared if the approved-quote confirm dialog is
  // dismissed without saving, so a later unrelated save can't misfire it.
  const createProjectAfterSave = useRef(false);
  // Same idea for the materials-sheet action (Add / View materials sheet):
  // a path to open once the pending save lands.
  const openAfterSave = useRef<string | null>(null);

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["product-catalog"],
    queryFn: listProductCatalog,
  });
  const { data: quickQuoteRates = [] } = useQuery({
    queryKey: ["quick-quote-rates"],
    queryFn: listQuickQuoteRates,
  });

  const projectId = quote.project_id;

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const { data: activeProjects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  // listProjects() leaves out pre-sale projects (isPreSaleProject) — which is
  // where an opportunity's quotes live — so keep this quote's own project in
  // the picker anyway, or the field would show blank.
  const projects =
    projectId && !activeProjects.some((p) => p.id === projectId)
      ? [{ id: projectId, name: quote.project?.name ?? "Project" }, ...activeProjects]
      : activeProjects;
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: quoteDefaults = QUOTE_DEFAULTS_FALLBACK } = useQuery({
    queryKey: ["quote-defaults"],
    queryFn: getQuoteDefaults,
  });
  // Terms card's "Save as my default terms" — Settings > Quote defaults.
  const saveDefaultTermsMut = useMutation({
    mutationFn: (terms: string | null) => saveQuoteDefaults({ terms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-defaults"] });
      toast({ title: "Saved as your default terms", description: "New quotes will start with these terms." });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials", { project: projectId }],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  const { data: overheadSettings } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });
  const currentOverheadRate = burdenPerHour(overheadSettings);
  const recalcOverheadMut = useMutation({
    mutationFn: () =>
      updateQuote(quote.id, {
        overhead_rate: currentOverheadRate == null ? null : Math.round(currentOverheadRate * 100) / 100,
        target_margin_pct: overheadSettings?.target_margin_pct ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote", quote.id] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Recalculated with current overhead" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  // The project's one Cost plan (0106) — whether it exists yet.
  const { data: materialsSheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: projectId }],
    queryFn: () => listMaterialsSheets(projectId!),
    enabled: !!projectId,
  });
  const { data: projectQuotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId!),
    enabled: !!projectId,
  });
  const addonNumber = addonQuoteNumbers(projectQuotes).get(quote.id);
  // The plan sections this quote's sections compare against: the project's
  // one Cost plan (features make the pairing automatic).
  const sheetSectionsForLinking = materials;
  const currentSheetSectionIds = useMemo(() => new Set(sheetSectionsForLinking.map((s) => s.id)), [sheetSectionsForLinking]);

  // Section project-type tags — the project's own types (or every category
  // for a standalone quote).
  const { data: linkedProject } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });
  const projectTypeOptions = useMemo(() => {
    if (!linkedProject) return categories;
    const ids = new Set(projectCategoryIds(linkedProject));
    return categories.filter((c) => ids.has(c.id));
  }, [linkedProject, categories]);

  // --- draft state --------------------------------------------------------
  const [draft, setDraft] = useState<QuoteDraft>(() => seed(quote));
  const dirty = useRef(false);

  // Re-seed from the server when the quote reloads — but never clobber unsaved
  // edits. (Changing the Client / project link refetches the quote; the draft
  // is preserved across that.)
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(quote));
  }, [quote]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: QuoteDraft) => QuoteDraft) => {
    markDirty();
    setDraft(fn);
  };
  const setSections = (fn: (s: DraftSection[]) => DraftSection[]) =>
    edit((d) => ({ ...d, sections: fn(d.sections) }));
  const { moveSection, moveItem, onDragEnd } = useSectionReorder<DraftItem, DraftSection>(setSections);
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

  // Not-yet-uploaded image previews are local blob URLs — revoke them
  // before throwing the draft away so they don't leak. Nothing was ever
  // uploaded to Storage for them, so there's no server-side cleanup to do.
  const discard = () => {
    for (const s of draft.sections) for (const i of s.items) revokeLocalImageUrls(i);
    dirty.current = false;
    setDraft(seed(quote));
  };

  // --- local mutators ----------------------------------------------------
  // "Add section" opens the new section's feature picker straight away.
  const [autoOpenSectionId, setAutoOpenSectionId] = useState<string | null>(null);
  const addSection = () => {
    const id = tmpId();
    setSections((s) => [
      ...s,
      { id, name: "", is_optional: false, job_category_id: null, feature_id: null, materials_link_mode: "auto", materialIds: [], items: [] },
    ]);
    setAutoOpenSectionId(id);
  };
  // Quick Quote lands as an ordinary new draft section with exactly one
  // line item — indistinguishable from a manually-added section/item from
  // this point on, so everything below (edit, delete, add more rows, Save)
  // treats it exactly the same.
  /** The one line a Quick Quote produces — price, AI description, marked
   * with its build type so a re-run can find and update it. */
  const quickQuoteLine = (result: QuickQuoteResult, buildType: string): DraftItem => ({
    id: tmpId(),
    name: result.name,
    description: result.description,
    price: result.rate,
    quantity: result.quantity,
    unit: result.unit,
    is_optional: false,
    // Same as the database default: optional work counts toward the
    // all-in total unless the client deselects it (Client Hub).
    client_selected: true,
    // The build type's category (same alias mapping as sections), so the
    // line counts under that category in Revenue by category.
    category_id: categoryIdForBuildType(buildType, projectTypeOptions, categories),
    quick_quote_build_type: buildType,
    images: [],
  });
  const addQuickQuoteSection = (result: QuickQuoteResult, buildType: string) =>
    setSections((s) => {
      // Quick Quote knows its feature — tag it like a Smart Section is, and
      // price the project's first feature of that type without a section.
      const job_category_id = categoryForSectionName(result.name, projectTypeOptions, categories);
      const used = new Set(s.map((x) => x.feature_id).filter(Boolean));
      const feature = liveFeatures(projectFeatures).find((f) => f.category_id === job_category_id && !used.has(f.id));
      return [
      ...s,
      {
        id: tmpId(),
        name: result.name,
        is_optional: false,
        job_category_id,
        feature_id: feature?.id ?? null,
        materials_link_mode: "auto",
        materialIds: [],
        items: [quickQuoteLine(result, buildType)],
      },
      ];
    });

  // --- Quick Quote on an existing section (its toolbar action) -----------
  // Which section the open Quick Quote is for (null = the page-level
  // "Quick Quote" that adds a new section).
  const [quickQuoteSectionId, setQuickQuoteSectionId] = useState<string | null>(null);
  // A result waiting on "Replace items / Add as a new line".
  const [pendingQuickQuote, setPendingQuickQuote] = useState<{ sectionId: string; item: DraftItem } | null>(null);
  /** The Quick Quote template for a section's project type, if it has one. */
  const quickQuoteBuildTypeFor = (section: DraftSection): string | null => {
    const name = categories.find((c) => c.id === section.job_category_id)?.name;
    const bt = name ? buildTypeForCategoryName(name)?.id : null;
    return bt && findQuickQuoteTemplate(bt) ? bt : null;
  };
  const startSectionQuickQuote = (section: DraftSection) => {
    setQuickQuoteSectionId(section.id);
    // Known feature → straight to the form; otherwise ask what it is first.
    const bt = quickQuoteBuildTypeFor(section);
    if (bt) setQuickQuoteBuildType(bt);
    else setQuickQuotePickerOpen(true);
  };
  const applySectionQuickQuote = (sectionId: string, result: QuickQuoteResult, buildType: string) => {
    const section = draft.sections.find((x) => x.id === sectionId);
    if (!section) return;
    const line = quickQuoteLine(result, buildType);
    const existing = section.items.find((i) => i.quick_quote_build_type);
    if (existing) {
      // Re-run: update that same line in place (keeps its id, photos, category).
      setSections((s) =>
        s.map((x) =>
          x.id === sectionId
            ? {
                ...x,
                items: x.items.map((i) =>
                  i.id === existing.id
                    ? { ...i, name: line.name, description: line.description, price: line.price, quantity: line.quantity, unit: line.unit, quick_quote_build_type: buildType, category_id: i.category_id ?? line.category_id }
                    : i,
                ),
              }
            : x,
        ),
      );
    } else if (section.items.length === 0) {
      setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, items: [line] } : x)));
    } else {
      setPendingQuickQuote({ sectionId, item: line });
    }
  };
  const resolvePendingQuickQuote = (mode: "replace" | "add") => {
    if (!pendingQuickQuote) return;
    const { sectionId, item } = pendingQuickQuote;
    setSections((s) =>
      s.map((x) =>
        x.id === sectionId
          ? { ...x, items: mode === "replace" ? (x.items.forEach(revokeLocalImageUrls), [item]) : [...x.items, item] }
          : x,
      ),
    );
    setPendingQuickQuote(null);
  };
  const renameSection = (sid: string, name: string) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, name } : x)));
  // The type chip: the name follows the new type while it's still the
  // autofilled one (see withSectionType); a hand-typed name is left alone.
  const setSectionType = (sid: string, job_category_id: string | null) =>
    setSections((s) => s.map((x) => (x.id === sid ? withSectionType(x, job_category_id, categories) : x)));
  // The name field's feature picker: name + type (+ feature) in one step —
  // an existing feature, a new feature of a type (created on Save), or a
  // bare type / build type.
  const pickSectionFeature = (sid: string, o: SectionFeatureOption) =>
    setSections((s) =>
      s.map((x) => {
        if (x.id !== sid) return x;
        const typeName = categories.find((c) => c.id === o.categoryId)?.name;
        return {
          ...x,
          name: o.newFeature ? (typeName ?? o.label) : o.label,
          job_category_id: o.categoryId ?? x.job_category_id,
          ...(o.featureId
            ? { feature_id: o.featureId, new_feature_category_id: null }
            : o.newFeature
              ? { feature_id: null, new_feature_category_id: o.categoryId }
              : {}),
        };
      }),
    );
  // Typed name committed: an untyped section whose name matches a feature
  // gets that type. Only touches the draft when something changes.
  const commitSectionName = (sid: string) => {
    const section = draft.sections.find((x) => x.id === sid);
    if (!section) return;
    const next = withCommittedSectionName(section, projectTypeOptions, categories);
    if (next !== section) setSections((s) => s.map((x) => (x.id === sid ? next : x)));
  };
  const featureOptions = useMemo(() => sectionFeatureOptions(projectTypeOptions, categories), [projectTypeOptions, categories]);
  // Project quotes pick the project's features (0105); standalone quotes
  // (and projects before 0105) pick types.
  const { data: projectFeatures = [] } = useQuery({
    queryKey: ["project-features", projectId],
    queryFn: () => listProjectFeatures(projectId!),
    enabled: !!projectId,
  });
  const hasFeatures = projectFeatures.length > 0;
  // An add-on quote (0108) prices only its own (proposed) features.
  const isAddon = quote.kind === "addon";
  const pickableFeatures = isAddon ? projectFeatures.filter((f) => f.source_quote_id === quote.id) : projectFeatures;
  const featurePickerFor = (sid: string): SectionFeaturePicker => ({
    ...(hasFeatures
      ? featurePickerOptions(
          pickableFeatures,
          categories,
          new Set(draft.sections.filter((x) => x.id !== sid && x.feature_id).map((x) => x.feature_id!)),
        )
      : featureOptions),
    usedCategoryIds: hasFeatures
      ? new Set<string>()
      : new Set(draft.sections.filter((x) => x.id !== sid && x.job_category_id).map((x) => x.job_category_id!)),
    onPick: (o) => pickSectionFeature(sid, o),
    onCommit: () => commitSectionName(sid),
    autoOpen: autoOpenSectionId === sid,
    onAutoOpened: () => setAutoOpenSectionId(null),
  });
  const setSectionMaterials = (sid: string, next: { mode: "auto" | "manual"; ids: string[] }) =>
    setSections((s) =>
      s.map((x) => (x.id === sid ? { ...x, materials_link_mode: next.mode, materialIds: next.mode === "manual" ? next.ids : [] } : x)),
    );
  const toggleSectionOptional = (sid: string, v: boolean) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, is_optional: v } : x)));
  const removeSection = (sid: string) =>
    setSections((s) => {
      const target = s.find((x) => x.id === sid);
      if (target) for (const i of target.items) revokeLocalImageUrls(i);
      return s.filter((x) => x.id !== sid);
    });
  const addItem = (sid: string) =>
    setSections((s) =>
      s.map((x) =>
        x.id === sid
          ? {
              ...x,
              items: [
                ...x.items,
                {
                  id: tmpId(),
                  name: "",
                  description: "",
                  price: 0,
                  quantity: 1,
                  unit: "ea",
                  is_optional: false,
                  // Same as the database default: optional work counts toward
                  // the all-in total unless the client deselects it.
                  client_selected: true,
                  category_id: null,
                  quick_quote_build_type: null,
                  images: [],
                },
              ],
            }
          : x,
      ),
    );
  const editItem = (sid: string, iid: string, patch: Partial<DraftItem>) =>
    setSections((s) =>
      s.map((x) =>
        x.id === sid ? { ...x, items: x.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : x,
      ),
    );
  const removeItem = (sid: string, iid: string) =>
    setSections((s) =>
      s.map((x) => {
        if (x.id !== sid) return x;
        const removed = x.items.find((i) => i.id === iid);
        if (removed) revokeLocalImageUrls(removed);
        return { ...x, items: x.items.filter((i) => i.id !== iid) };
      }),
    );

  // --- server sync -------------------------------------------------------
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["quote", quote.id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  // Client Selections (0115): which section's group dialog is open, and a
  // saved template to seed a new group from.
  const [selectionEditing, setSelectionEditing] = useState<{ sectionId: string; value: string | null; seed?: Partial<SelectionGroupDraft> | null } | null>(null);
  const { data: selectionTemplates = [] } = useQuery({ queryKey: ["selection-templates"], queryFn: listSelectionTemplates });
  const selectionsChanged = () => {
    invalidate();
    // Out with the client → editing selections is a new quote version.
    if (quote.status !== "draft") void snapshotDocument("quote", quote.id);
  };
  const serverGroupsBySection = new Map(quote.quote_sections.map((s) => [s.id, s.quote_selection_groups ?? []]));
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const updateClientMut = useMutation({
    mutationFn: (clientId: string | null) => updateQuote(quote.id, { client_id: clientId }),
    onSuccess: invalidate,
    onError,
  });
  const updateProjectLinkMut = useMutation({
    mutationFn: (newProjectId: string | null) => updateQuote(quote.id, { project_id: newProjectId }),
    onSuccess: invalidate,
    onError,
  });
  // Diff the draft against the server quote and write only what changed.
  // Rows a save has created so far — a save that fails partway must not
  // create them again on the next try (remapDraftIds).
  const createdIds = useRef(new Map<string, string>());
  const saveMut = useMutation({
    mutationFn: async () => {
      createdIds.current = new Map();
      // An approved quote's sections/items/photos are locked at the DB
      // level (0033) — editing must revert it to draft FIRST (a separate,
      // awaited call — these are independent REST requests, not one
      // transaction) or the writes below would be rejected by that lock.
      // This is what actually invalidates the client's signature; the
      // confirm dialog just makes sure that's not a surprise.
      const wasApproved = quote.status === "approved";
      if (wasApproved) {
        await updateQuote(quote.id, {
          status: "draft",
          signed_at: null,
          signed_by: null,
          // Contractor-recorded approval (0133) goes too — only once that column exists.
          ...("approved_manually_by" in quote ? { approved_manually_by: null, approval_method: null, approval_note: null } : {}),
        });
      }

      const serverSections = new Map(quote.quote_sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.sections.map((s) => s.id));

      // New features picked in a section header are created first, and get
      // their Cost plan section after the save (ensureFeatureSections).
      let featuresAdded = false;
      for (const ds of draft.sections) {
        if (ds.feature_id || !ds.new_feature_category_id || !quote.project_id) continue;
        try {
          const f = await createProjectFeature(
            quote.project_id,
            isAddon
              ? { category_id: ds.new_feature_category_id, status: "proposed", source_quote_id: quote.id }
              : { category_id: ds.new_feature_category_id },
          );
          ds.feature_id = f.id;
          featuresAdded = true;
        } catch {
          // before 0105: the section just keeps its type
        }
      }

      // 1. deletes — server sections no longer in the draft (cascades items)
      for (const s of quote.quote_sections) {
        if (!draftSectionIds.has(s.id)) await deleteQuoteSection(s.id);
      }

      // 2. per section: create / update, then its items
      for (let si = 0; si < draft.sections.length; si++) {
        const ds = draft.sections[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await addQuoteSection(quote.id, {
            name,
            is_optional: ds.is_optional,
            sort_order: si,
            job_category_id: ds.job_category_id,
            feature_id: ds.feature_id,
            materials_link_mode: ds.materials_link_mode,
          });
          sectionId = created.id;
          createdIds.current.set(ds.id, created.id);
        } else if (
          server.name !== name ||
          server.is_optional !== ds.is_optional ||
          server.sort_order !== si
        ) {
          await updateQuoteSection(server.id, {
            name,
            is_optional: ds.is_optional,
            sort_order: si,
          });
        }
        if (
          server &&
          ((server.job_category_id ?? null) !== ds.job_category_id ||
            (server.materials_link_mode ?? "auto") !== ds.materials_link_mode)
        ) {
          await updateQuoteSection(server.id, {
            job_category_id: ds.job_category_id,
            materials_link_mode: ds.materials_link_mode,
          });
        }
        if (server && (server.feature_id ?? null) !== ds.feature_id) {
          await updateQuoteSection(server.id, { feature_id: ds.feature_id });
        }
        // Manual materials picks: keep only sections that still exist on the
        // quote's current materials sheet (stale ones are pruned here), and
        // clear any stored picks once the section is back on auto.
        {
          const wanted =
            ds.materials_link_mode === "manual"
              ? ds.materialIds.filter((mid) => currentSheetSectionIds.has(mid))
              : [];
          const stored = (server?.quote_section_material_links ?? []).map((l) => l.materials_section_id);
          const same = wanted.length === stored.length && wanted.every((mid) => stored.includes(mid));
          if (!same) await setQuoteSectionMaterialLinks(sectionId, wanted);
        }

        const serverItems = new Map((server?.quote_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        if (server) {
          for (const i of server.quote_items) {
            if (!draftItemIds.has(i.id)) await deleteQuoteItem(i.id);
          }
        }

        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const desc = di.description.trim() || null;
          const unit = di.unit.trim() || null;
          const srv = serverItems.get(di.id);
          let itemId: string;

          if (!srv) {
            const created = await addQuoteItem(sectionId, {
              name: di.name,
              description: desc,
              price: di.price,
              quantity: di.quantity,
              unit,
              is_optional: di.is_optional,
              sort_order: ii,
              category_id: di.category_id,
              quick_quote_build_type: di.quick_quote_build_type,
            });
            itemId = created.id;
            createdIds.current.set(di.id, created.id);
          } else {
            itemId = srv.id;
            if (
              srv.name !== di.name ||
              (srv.description ?? null) !== desc ||
              Number(srv.price) !== di.price ||
              (srv.quantity == null ? 1 : Number(srv.quantity)) !== di.quantity ||
              (srv.unit ?? null) !== unit ||
              srv.is_optional !== di.is_optional ||
              srv.sort_order !== ii ||
              (srv.category_id ?? null) !== di.category_id ||
              (srv.quick_quote_build_type ?? null) !== di.quick_quote_build_type
            ) {
              await updateQuoteItem(srv.id, {
                name: di.name,
                description: desc,
                price: di.price,
                quantity: di.quantity,
                unit,
                is_optional: di.is_optional,
                sort_order: ii,
                category_id: di.category_id,
                // Only sent when it changed, so ordinary edits work before 0102.
                ...((srv.quick_quote_build_type ?? null) !== di.quick_quote_build_type
                  ? { quick_quote_build_type: di.quick_quote_build_type }
                  : {}),
              });
            }
          }

          // Images — diff the draft against what's actually persisted for
          // this item. A brand-new item has no server images at all, so
          // every draft image on it is by definition a fresh upload.
          const serverImages = srv?.quote_item_images ?? [];
          const draftImageIds = new Set(
            di.images.filter((img) => img.storage_path).map((img) => img.id),
          );
          for (const img of serverImages) {
            if (!draftImageIds.has(img.id)) await deleteQuoteItemImage(img);
          }
          for (let ki = 0; ki < di.images.length; ki++) {
            const dimg = di.images[ki];
            if (dimg.file) {
              await uploadQuoteItemImage(itemId, dimg.file, ki);
              if (dimg.previewUrl) URL.revokeObjectURL(dimg.previewUrl);
            }
          }
        }
      }

      // 3. quote-level fields
      const patch: Parameters<typeof updateQuote>[1] = {};
      if ((quote.notes ?? "") !== draft.notes) patch.notes = draft.notes.trim() || null;
      if ((quote.terms ?? "") !== draft.terms) patch.terms = draft.terms.trim() || null;
      if (Number(quote.deposit_percentage) !== draft.depositPct)
        patch.deposit_percentage = draft.depositPct;
      if (Object.keys(patch).length) await updateQuote(quote.id, patch);
      if (featuresAdded && quote.project_id) await ensureFeatureSections(quote.project_id);

      return { wasApproved };
    },
    onSuccess: ({ wasApproved }) => {
      dirty.current = false;
      // Out with the client → a revision is a new version (0113). An
      // approved quote reverted to draft here gets its next version when
      // it's sent again.
      if (!wasApproved && quote.status !== "draft") void snapshotDocument("quote", quote.id);
      invalidate();
      qc.invalidateQueries({ queryKey: ["project-features", projectId] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      if (wasApproved) {
        void logProjectEvent(
          projectId,
          "quote_reverted",
          "Quote edited after approval — signature invalidated, reverted to draft",
        );
        qc.invalidateQueries({ queryKey: ["project-events", projectId] });
        toast({ title: "Quote saved", description: "Signature invalidated — back to draft." });
      } else if (!createProjectAfterSave.current) {
        toast({ title: "Quote saved" });
      }
      if (createProjectAfterSave.current) {
        createProjectAfterSave.current = false;
        navigate("/projects/new", { state: { linkQuoteId: quote.id } });
      } else if (openAfterSave.current) {
        const to = openAfterSave.current;
        openAfterSave.current = null;
        navigate(to);
      }
    },
    onError: (err: Error) => {
      // Keep what did save (real ids + refreshed server copy) so Save again finishes it without duplicates.
      if (createdIds.current.size) {
        const created = createdIds.current;
        edit((d) => ({ ...d, sections: remapDraftIds(d.sections, created) }));
      }
      invalidate();
      toast({ title: "Couldn't finish saving", description: `${err.message} — what saved is kept; Save again to finish.`, variant: "destructive" });
    },
  });

  const shareQuoteMut = useMutation({
    mutationFn: async () => {
      const token = quote.share_token ?? (await generateShareLink("quotes", quote.id));
      // Sending freezes the overhead rate it's priced with (0110).
      const freeze =
        quote.overhead_rate == null && currentOverheadRate != null
          ? { overhead_rate: Math.round(currentOverheadRate * 100) / 100, target_margin_pct: overheadSettings?.target_margin_pct ?? null }
          : {};
      await updateQuote(quote.id, { status: "sent", ...freeze });
      return token;
    },
    onSuccess: async (token) => {
      // Re-sending an already-sent quote doesn't change its status, so the
      // status trigger doesn't fire — snapshot explicitly (no-op if unchanged).
      void snapshotDocument("quote", quote.id);
      invalidate();
      void logProjectEvent(projectId, "quote_sent", `Quote shared · ${formatCurrency(grandTotal)}`, {
        quote_id: quote.id,
      });
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      setShareUrl(`${window.location.origin}/quote/${token}`);

      // Pipeline auto-advance — sending a quote (first send or a
      // revision) moves the linked opportunity to Proposal Sent, the one
      // "the data already exists" trigger that lives client-side (the
      // other one, Won on signature, has to live in the sign_quote/
      // portal_approve_quote SQL — see migration 0072 — since neither
      // signing path runs with an owner session).
      const opportunity = await getOpportunityByQuoteId(quote.id);
      if (opportunity) {
        await advanceStageOnQuoteSent(opportunity);
        qc.invalidateQueries({ queryKey: ["opportunity", opportunity.id] });
        qc.invalidateQueries({ queryKey: ["opportunities"] });
      }
    },
    onError,
  });

  // Preview never changes the quote's status — it just makes sure a share
  // token exists (even for a draft) and opens the client-facing page.
  const previewMut = useMutation({
    mutationFn: async () => quote.share_token ?? generateShareLink("quotes", quote.id),
    onSuccess: (token) => {
      invalidate();
      window.open(`${window.location.origin}/quote/${token}`, "_blank", "noopener,noreferrer");
    },
    onError,
  });

  // Client Share Card's Share/Copy buttons: same "mint a token without
  // touching status" as Preview, just a different thing to do with it once
  // it exists.
  const ensureLinkMut = useMutation({
    mutationFn: async (intent: "share" | "copy") => ({
      token: quote.share_token ?? (await generateShareLink("quotes", quote.id)),
      intent,
    }),
    onSuccess: ({ token, intent }) => {
      invalidate();
      const url = `${window.location.origin}/quote/${token}`;
      if (intent === "share") {
        setShareUrl(url);
      } else {
        navigator.clipboard.writeText(url).then(
          () => toast({ title: "Link copied" }),
          () => toast({ title: "Couldn't copy link", variant: "destructive" }),
        );
      }
    },
    onError,
  });

  // --- derived amounts (from the draft) ---------------------------------
  // A section's own header subtotal is a plain sum of everything in it —
  // required or optional — so an optional section always shows its real
  // worth instead of $0 until a client checks it off on the live page.
  const sectionSubtotal = (s: DraftSection) =>
    s.items.reduce((sum, i) => sum + lineTotal(i), 0) + selectionsTotal((serverGroupsBySection.get(s.id) ?? []).map(groupFromRows));
  const baseTotal = draft.sections.reduce((sum, s) => sum + baseSubtotal(s), 0);
  // Add-ons the client has actually picked on the live page — the quote
  // total only ever counts required items plus these, never an optional
  // item nobody has selected (see optionalAvailableTotal below for the
  // still-unpicked complement).
  const selectedAddonsTotal = draft.sections.reduce(
    (sum, s) =>
      sum +
      s.items.reduce((a, i) => a + (itemIsAddon(s, i) && i.client_selected ? lineTotal(i) : 0), 0),
    0,
  );
  const selectedAddonCount = draft.sections.reduce(
    (n, s) => n + s.items.filter((i) => itemIsAddon(s, i) && i.client_selected).length,
    0,
  );
  const optionalAvailableTotal = draft.sections.reduce(
    (sum, s) =>
      sum +
      s.items.reduce((a, i) => a + (itemIsAddon(s, i) && !i.client_selected ? lineTotal(i) : 0), 0),
    0,
  );
  // Est. cost = the project's Cost plan total (active features + General;
  // proposed add-on and removed features never count). No plan yet → "Not
  // available", never a $0 cost (which used to read as a 100% margin).
  const hasMaterialsSheet = materialsSheets.length > 0;
  // An add-on's cost is just its own features' sections (proposed until
  // approved, so not in the project total).
  const addonFeatureIds = new Set(pickableFeatures.map((f) => f.id));
  // The add-on's (first) new feature and its Cost plan section — the step links' targets.
  const addonFeature = isAddon ? pickableFeatures[0] ?? null : null;
  const addonSection = addonFeature ? materials.find((m) => m.feature_id === addonFeature.id) ?? null : null;
  const addonCostSections = isAddon ? materials.filter((m) => m.feature_id && addonFeatureIds.has(m.feature_id)) : [];
  // Its features not priced in the Cost plan yet → cost unknown, not $0.
  const materialsCost = !hasMaterialsSheet
    ? null
    : isAddon
      ? costPlanHasEntries(addonCostSections)
        ? sumSectionTotals(addonCostSections, { all: true }).total
        : null
      : costPlanTotal(materials);
  const materialsAction: MaterialsAction = !projectId
    ? { label: "Create project to add a cost plan", onClick: () => handleCreateProjectClick(), primary: true }
    : !hasMaterialsSheet
      ? { label: "Add cost plan", onClick: () => openMaterialsPage(`/projects/${projectId}/materials`), primary: true }
      : { label: "View cost plan", onClick: () => openMaterialsPage(`/projects/${projectId}/materials`), primary: false };
  // The headline figure — required + whatever optional items the client has
  // currently selected, no tax (sales tax was a fabricated demo estimate,
  // never a real figure — removed). Matches quoteTotal() (api.ts) — a
  // quote's total means the same thing everywhere now: required items plus
  // selected optionals, the only work actually committed to.
  // Client Selections: each included section's chosen (or default) options.
  const selectionsOf = (s: DraftSection) => (serverGroupsBySection.get(s.id) ?? []).map(groupFromRows);
  const selectionsAmount = draft.sections.reduce((sum, s) => sum + (sectionIncluded(s) ? selectionsTotal(selectionsOf(s)) : 0), 0);
  // Internal cost adjustments of the options that count now — until
  // approval, when they're applied to the Cost plan itself.
  const selectionsCost =
    quote.status === "approved" ? 0 : draft.sections.reduce((sum, s) => sum + (sectionIncluded(s) ? selectionsOf(s).reduce((a, g) => a + groupCost(g), 0) : 0), 0);
  const selectionsRange = selectionRange(draft.sections.filter(sectionIncluded).flatMap(selectionsOf));
  const grandTotal = baseTotal + selectedAddonsTotal + selectionsAmount;
  // Deposit, cost, and margin all compare against the same all-in headline
  // — once optional work is part of "the total," it's part of everything
  // derived from it too.
  const depositAmount = depositAmountOf(grandTotal, draft.depositPct);
  // Standalone quotes (no project) have no real cost source — the Materials
  // Sheet lives on a project. There used to be a guessed fallback here
  // (60% of the quote total, from demoQuoteFinancials().estCost) but that
  // was fabricated, not derived from anything real, so it's gone. Margin
  // and profit are equally undefined without a real cost, so both cascade
  // to null too rather than displaying a number built on the same guess.
  // A project-linked quote with an ambiguous, unlinked materials sheet is
  // equally undefined until the user picks one — see needsExplicitMaterialsLink.
  // costPlanTotal() already sums the whole linked sheet unconditionally (a
  // materials sheet has no optional/required split of its own), so this
  // cost figure was never scoped down to "required only" to begin with.
  const estCost = projectId ? (materialsCost == null ? null : materialsCost + selectionsCost) : null;

  // True cost (0110, internal): overhead applied through planned labor at
  // the rate stored on this quote (drafts can recalculate to the current).
  const trueCostSections = isAddon
    ? materials.filter((m) => m.feature_id && addonFeatureIds.has(m.feature_id)).map((m) => ({ ...m, feature: null }))
    : materials;
  const storedRate = quote.overhead_rate == null ? null : Number(quote.overhead_rate);
  const overheadRate = storedRate ?? currentOverheadRate;
  const canRecalculate =
    quote.status === "draft" && currentOverheadRate != null && (storedRate == null || Math.abs(storedRate - currentOverheadRate) >= 0.005);
  const trueCostNode = (collapsible: boolean) =>
    // Only with a real cost — an unpriced add-on would read as 100% profit.
    projectId && hasMaterialsSheet && estCost != null ? (
      <TrueCostSummary
        collapsible={collapsible}
        direct={estCost}
        manHours={plannedManHours(trueCostSections)}
        rate={overheadRate}
        price={grandTotal}
        targetMarginPct={quote.target_margin_pct ?? overheadSettings?.target_margin_pct ?? null}
        laborRate={averageLaborRate(trueCostSections)}
        settings={overheadSettings ?? null}
        lumpSumsWithoutHours={lumpSumsWithoutHours(trueCostSections)}
        rateNote={
          overheadRate == null ? null : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {storedRate != null
                  ? `Overhead ${formatCurrency(storedRate)}/hr stored on this quote`
                  : `Using current overhead ${formatCurrency(overheadRate)}/hr (not stored on this quote yet)`}
              </span>
              {canRecalculate && (
                <button
                  type="button"
                  onClick={() => recalcOverheadMut.mutate()}
                  disabled={recalcOverheadMut.isPending}
                  className="font-bold text-primary hover:underline disabled:opacity-50"
                >
                  Recalculate with current overhead
                </button>
              )}
            </span>
          )
        }
      />
    ) : null;
  const margin = estCost == null ? null : grandTotal - estCost;
  const marginPct = estCost == null ? null : grandTotal > 0 ? (margin! / grandTotal) * 100 : 0;

  const itemCount = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const sectionRows = draft.sections
    .filter((s) => !s.is_optional && s.items.some((i) => !i.is_optional))
    .map((s) => ({ id: s.id, name: s.name || "Untitled section", subtotal: baseSubtotal(s) }));
  const terms = demoQuoteTerms(quote, draft.depositPct, quoteDefaults.quote_validity_days);

  const meta = quoteStatusMeta(quote.status);
  const clientName = quote.client?.name ?? quote.project?.client?.name ?? "No client";
  const persistedLink =
    quote.share_token && quote.status !== "draft"
      ? `${window.location.origin}/quote/${quote.share_token}`
      : null;

  const isDirty = dirty.current;

  const handleSaveClick = () => {
    createProjectAfterSave.current = false;
    openAfterSave.current = null;
    if (quote.status === "approved") {
      setConfirmApprovedSaveOpen(true);
    } else {
      saveMut.mutate();
    }
  };

  // The standalone-quote "Create project" nudge: whatever's currently in
  // the editor must land in the new project, not just whatever the DB
  // already has — so if there are unsaved changes, save first (reusing
  // the exact same saveMut the Save button uses, including its
  // approved-quote confirm gate) and only navigate once that succeeds.
  // Opens a materials-sheet page, saving any unsaved quote edits first.
  const openMaterialsPage = (to: string) => {
    if (!isDirty) {
      navigate(to);
      return;
    }
    createProjectAfterSave.current = false;
    openAfterSave.current = to;
    if (quote.status === "approved") setConfirmApprovedSaveOpen(true);
    else saveMut.mutate();
  };

  const handleCreateProjectClick = () => {
    if (!isDirty) {
      navigate("/projects/new", { state: { linkQuoteId: quote.id } });
      return;
    }
    createProjectAfterSave.current = true;
    if (quote.status === "approved") {
      setConfirmApprovedSaveOpen(true);
    } else {
      saveMut.mutate();
    }
  };

  const primaryAction = (fullWidth?: boolean) =>
    quote.status === "draft" ? (
      <Button
        onClick={() => shareQuoteMut.mutate()}
        disabled={shareQuoteMut.isPending || isDirty}
        className={cn("font-bold", fullWidth && "w-full")}
      >
        {shareQuoteMut.isPending ? "Preparing…" : "Send for signature"}
      </Button>
    ) : (
      <Button
        variant="outline"
        onClick={() => persistedLink && setShareUrl(persistedLink)}
        disabled={!persistedLink}
        className={cn(fullWidth && "w-full")}
      >
        <Share2 className="mr-2 h-4 w-4" />
        Share link
      </Button>
    );

  // Same Send/Share choice as primaryAction, as plain label/onClick/disabled
  // for the QuoteSummaryCard's own button styling.
  const sendLabel =
    quote.status === "draft"
      ? shareQuoteMut.isPending
        ? "Preparing…"
        : "Send for signature"
      : "Share link";
  const sendDisabled =
    quote.status === "draft" ? shareQuoteMut.isPending || isDirty : !persistedLink;
  const onSendClick = () =>
    quote.status === "draft" ? shareQuoteMut.mutate() : persistedLink && setShareUrl(persistedLink);
  const previewLabel = previewMut.isPending ? "Opening…" : "Preview";

  return (
    <div className="animate-fade-in max-w-6xl space-y-5">
      <MobilePageHeader
        className="mobile-header-ink"
        title={quote.project?.name ?? "Standalone quote"}
        subtitle={`${meta.label} · ${clientName}`}
        back={{ to: backHref, label: backLabel }}
        pills={
          <>
            <span className="badge-status !bg-white/20 !text-sidebar-foreground">
              {pluralize(itemCount, "item")}
            </span>
            <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">{meta.label}</span>
          </>
        }
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <BackLink
          to={backHref}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >{backLabel}</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-subtle">
              Quotes{quote.status === "draft" ? " · Draft" : ""}
            </div>
            <div className="mt-1 flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">
                {quote.project?.name ?? "Standalone quote"}
              </h1>
              <StatusPill meta={meta} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">{clientName}</p>
              {projectId && (
                <Button asChild variant="outline" size="sm" className="h-8 font-semibold">
                  <Link to={`/projects/${projectId}`}>
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Go to project
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && quote.status === "draft" && (
              <span className="text-xs text-muted-foreground">Save your changes first</span>
            )}
            {primaryAction()}
          </div>
        </div>
      </div>

      {/* Phones: the project is one tap away too (the header's back goes to the list). */}
      {projectId && (
        <Button asChild variant="outline" className="h-11 w-full font-semibold md:hidden">
          <Link to={`/projects/${projectId}`}>
            <FolderOpen className="mr-1.5 h-4 w-4" /> Go to project · {quote.project?.name ?? "Project"}
          </Link>
        </Button>
      )}

      {/* Approval (0133) — who approved (client vs contractor-recorded), or "Mark approved". */}
      <QuoteApprovalRow quote={quote} clientName={quote.client?.name ?? quote.project?.client?.name ?? null} disabledReason={isDirty ? "Save your changes first" : null} />

      {/* Quote activity (0117) — how the client is engaging; internal only. */}
      {quote.status !== "draft" && <QuoteActivityLine quote={quote} />}

      {isAddon && (
        <div className="rounded-card border border-info/40 bg-info/5 p-4">
          <div className="text-sm font-bold text-foreground">
            Add-on quote{addonNumber ? ` #${addonNumber}` : ""} · new work on this job
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {pickableFeatures.map((f) => featureName(f, categories)).join(", ") || "No features yet"} — proposed until the
            client approves; then they join the job, its totals and its contract.
          </p>
          {projectId && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
              {/* Deep links: the project page opens the new feature's
                  Measurements card and pulses it; the Cost plan scrolls to
                  and flashes its section. */}
              <Link to={`/projects/${projectId}#measure${addonFeature?.category_id ? `-${addonFeature.category_id}` : ""}`} className="text-primary hover:underline">
                1 · Measure it (project page)
              </Link>
              <Link to={`/projects/${projectId}/materials${addonSection ? `#section-${addonSection.id}` : ""}`} className="text-primary hover:underline">
                2 · Price it in the Cost plan
              </Link>
              <span className="text-muted-foreground">3 · Price each section here and send</span>
            </div>
          )}
        </div>
      )}

      <ClientShareCard
        clientId={quote.client_id}
        clients={clients}
        onClientChange={(v) => updateClientMut.mutate(v)}
        onCreateProject={handleCreateProjectClick}
        projectId={quote.project_id}
        projects={projects}
        onProjectChange={(v) => updateProjectLinkMut.mutate(v)}
        isDirty={isDirty}
        hasToken={!!quote.share_token}
        shareUrl={quote.share_token ? `${window.location.origin}/quote/${quote.share_token}` : null}
        onShare={() => ensureLinkMut.mutate("share")}
        onCopy={() => ensureLinkMut.mutate("copy")}
        actionsDisabled={isDirty || ensureLinkMut.isPending}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left column — sections + notes */}
        <div className="space-y-4">
          {draft.sections.length === 0 && (
            <div className="stat-card py-12 text-center text-muted-foreground">
              No sections yet. Add a section to build the quote.
            </div>
          )}

          {draft.sections.length > 0 && (
            <CollapseAllLinks onCollapseAll={() => collapseAll(draft.sections.map((s) => s.id))} onExpandAll={() => expandAll(draft.sections.map((s) => s.id))} />
          )}

          <DragDropContext
            onDragStart={(start) => setIsDraggingItem(start.type === "item")}
            onDragEnd={(result) => {
              setIsDraggingItem(false);
              onDragEnd(result);
            }}
          >
            <Droppable droppableId="quote-sections" type="section">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                  {draft.sections.map((section, index) => (
                    <Draggable key={section.id} draggableId={section.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                          <LineItemSectionCard
                            section={section}
                            subtotal={sectionSubtotal(section)}
                            categories={categories}
                            onRename={(name) => renameSection(section.id, name)}
                            featurePicker={featurePickerFor(section.id)}
                            toolbarActions={
                              <>
                                <SectionQuickQuoteAction
                                  projectId={quote.project_id}
                                  featureId={section.feature_id ?? null}
                                  buildType={quickQuoteBuildTypeFor(section)}
                                  hasQuickQuote={section.items.some((i) => i.quick_quote_build_type)}
                                  onClick={() => startSectionQuickQuote(section)}
                                />
                                {!isTmp(section.id) && quote.status !== "approved" && (
                                  <>
                                    <SectionToolbarAction
                                      icon={ListChecks}
                                      label="Add client selection"
                                      onClick={() => setSelectionEditing({ sectionId: section.id, value: "new" })}
                                    />
                                    {selectionTemplates.length > 0 && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
                                            <BookmarkPlus className="h-3.5 w-3.5" />
                                            Insert saved group
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                          {selectionTemplates.map((t) => (
                                            <DropdownMenuItem
                                              key={t.id}
                                              onSelect={() =>
                                                setSelectionEditing({
                                                  sectionId: section.id,
                                                  value: "new",
                                                  seed: { name: t.name, help_text: t.help_text, required: t.required, multi: t.multi, options: t.options },
                                                })
                                              }
                                            >
                                              {t.name}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </>
                                )}
                              </>
                            }
                            afterItems={
                              !isTmp(section.id) ? (
                                <QuoteSectionSelections
                                  quoteSectionId={section.id}
                                  groups={serverGroupsBySection.get(section.id) ?? []}
                                  approved={quote.status === "approved"}
                                  linkableLines={materials
                                    .filter((m) => (section.feature_id ? m.feature_id === section.feature_id : section.materialIds.includes(m.id)))
                                    .flatMap((m) => m.materials_items ?? [])}
                                  catalogItems={catalogItems}
                                  onChanged={selectionsChanged}
                                  editing={selectionEditing?.sectionId === section.id ? selectionEditing.value : null}
                                  setEditing={(v) => setSelectionEditing(v === null ? null : { sectionId: section.id, value: v })}
                                  templateSeed={selectionEditing?.sectionId === section.id ? selectionEditing.seed : null}
                                />
                              ) : undefined
                            }
                            onDeleteSection={() => removeSection(section.id)}
                            onAddItem={() => addItem(section.id)}
                            onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
                            onDeleteItem={(iid) => removeItem(section.id, iid)}
                            dragHandleProps={dragProvided.dragHandleProps}
                            dragging={dragSnapshot.isDragging}
                            canMoveUp={index > 0}
                            canMoveDown={index < draft.sections.length - 1}
                            onMoveUp={() => moveSection(index, -1)}
                            onMoveDown={() => moveSection(index, 1)}
                            onMoveItem={(itemIndex, direction) => moveItem(section.id, itemIndex, direction)}
                            collapsed={isCollapsed(section.id)}
                            onToggleCollapse={() => toggleCollapse(section.id)}
                            isDraggingItem={isDraggingItem}
                            onAutoExpand={() => expandSection(section.id)}
                            tag={
                              <QuoteSectionHeaderTags
                                section={section}
                                price={sectionSubtotal(section)}
                                typeOptions={projectTypeOptions}
                                allCategories={categories}
                                sheetSections={sheetSectionsForLinking}
                                onTypeChange={(jobCategoryId) => setSectionType(section.id, jobCategoryId)}
                                onMaterialsChange={(next) => setSectionMaterials(section.id, next)}
                                overheadRate={overheadRate}
                                overheadSettings={overheadSettings ?? null}
                                targetMarginPct={quote.target_margin_pct ?? overheadSettings?.target_margin_pct ?? null}
                              />
                            }
                            optionalSection={{
                              checked: section.is_optional,
                              onChange: (checked) => toggleSectionOptional(section.id, checked),
                              isItemOptional: (itemId) =>
                                section.items.find((i) => i.id === itemId)?.is_optional ?? false,
                              onToggleItem: (itemId, checked) =>
                                editItem(section.id, itemId, { is_optional: checked }),
                            }}
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
              onClick={() => {
                // Page-level Quick Quote: a new section, not an existing one.
                setQuickQuoteSectionId(null);
                setQuickQuotePickerOpen(true);
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-primary/30 bg-primary/5 text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" />
              Add Quick Quote
            </button>
          </div>

          <div className="stat-card space-y-5">
            <div className="space-y-2">
              <Label htmlFor="quote-notes">Notes</Label>
              {/* At least 4 lines, grows with the text — no inner scrollbar,
                  no resize handle. */}
              <AutoGrowTextarea
                id="quote-notes"
                rows={4}
                value={draft.notes}
                placeholder="Any notes for the client about this job..."
                onChange={(e) => edit((d) => ({ ...d, notes: e.target.value }))}
                className="py-2 text-sm leading-relaxed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-deposit">Deposit required</Label>
              <div className="relative w-32">
                <Input
                  id="quote-deposit"
                  type="number"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  value={String(draft.depositPct)}
                  className="pr-7"
                  onChange={(e) =>
                    // 0–100 only (150% or a negative deposit used to save).
                    edit((d) => ({ ...d, depositPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Percentage of the quote total required upfront.
              </p>
            </div>
          </div>
        </div>

        {/* Desktop right rail — totals + quote total + margin, then terms */}
        <div className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
          <div className="card-surface p-[18px]">
            <div className="text-base font-bold text-foreground">Totals</div>
            <div className="mt-2.5">
              {sectionRows.map((r) => (
                <MoneyRow key={r.id} label={r.name} value={formatCurrency(r.subtotal)} />
              ))}
              {selectedAddonsTotal > 0 && (
                <MoneyRow label="Selected add-ons" value={formatCurrency(selectedAddonsTotal)} />
              )}
            </div>
            {optionalAvailableTotal > 0 && (
              <p className="mt-2.5 text-[11px] text-muted-foreground">
                + {formatCurrency(optionalAvailableTotal)} in optional add-ons the client can pick
              </p>
            )}
            {selectionsRange.min !== selectionsRange.max && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Client selections: {formatCurrency(selectionsAmount)} now (defaults / picks) · could range{" "}
                {formatCurrency(grandTotal - selectionsAmount + selectionsRange.min)} – {formatCurrency(grandTotal - selectionsAmount + selectionsRange.max)}
              </p>
            )}
          </div>

          <QuoteSummaryCard
            variant="desktop"
            onCreateProject={handleCreateProjectClick}
            total={grandTotal}
            baseTotal={baseTotal}
            optionalTotal={selectedAddonsTotal}
            optionalCount={selectedAddonCount}
            cost={estCost}
            profit={margin}
            marginPct={marginPct}
            materialsAction={materialsAction}
            trueCost={trueCostNode}
            depositPct={draft.depositPct}
            deposit={depositAmount}
            sendLabel={sendLabel}
            sendDisabled={sendDisabled}
            onSend={onSendClick}
            previewLabel={previewLabel}
            previewDisabled={isDirty || previewMut.isPending}
            onPreview={() => previewMut.mutate()}
          />

          <QuoteTermsCard
            validUntil={terms.validUntil}
            depositLabel={terms.depositLabel}
            value={draft.terms}
            onChange={(v) => edit((d) => ({ ...d, terms: v }))}
            defaultTerms={quoteDefaults.terms}
            onSaveAsDefault={() => saveDefaultTermsMut.mutate(draft.terms.trim() || null)}
            savingDefault={saveDefaultTermsMut.isPending}
          />
        </div>
      </div>

      {/* Mobile: one quote-total summary card at the bottom of the page. */}
      <div className="lg:hidden">
        <QuoteSummaryCard
          variant="mobile"
          onCreateProject={handleCreateProjectClick}
          total={grandTotal}
          baseTotal={baseTotal}
          optionalTotal={selectedAddonsTotal}
          optionalCount={selectedAddonCount}
          cost={estCost}
          profit={margin}
          marginPct={marginPct}
          materialsAction={materialsAction}
          trueCost={trueCostNode}
          depositPct={draft.depositPct}
          deposit={depositAmount}
          sendLabel={sendLabel}
          sendDisabled={sendDisabled}
          onSend={onSendClick}
          previewLabel={previewLabel}
          previewDisabled={isDirty || previewMut.isPending}
          onPreview={() => previewMut.mutate()}
        />
        <div className="mt-4">
          <QuoteTermsCard
            validUntil={terms.validUntil}
            depositLabel={terms.depositLabel}
            value={draft.terms}
            onChange={(v) => edit((d) => ({ ...d, terms: v }))}
            defaultTerms={quoteDefaults.terms}
            onSaveAsDefault={() => saveDefaultTermsMut.mutate(draft.terms.trim() || null)}
            savingDefault={saveDefaultTermsMut.isPending}
          />
        </div>
      </div>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={handleSaveClick}
        saving={saveMut.isPending}
      />

      <AlertDialog
        open={confirmApprovedSaveOpen}
        onOpenChange={(open) => {
          setConfirmApprovedSaveOpen(open);
          // Dismissed (Escape/outside click/Cancel) without saving — don't
          // let a stale "create project after save" flag misfire the next
          // unrelated save.
          if (!open) {
            createProjectAfterSave.current = false;
            openAfterSave.current = null;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editing an approved quote</AlertDialogTitle>
            <AlertDialogDescription>
              {quote.signed_by ? `${quote.signed_by}'s` : "The client's"} signature will be invalidated
              and this quote will revert to draft. They'll need to review and approve it again at the
              same link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmApprovedSaveOpen(false);
                saveMut.mutate();
              }}
            >
              Save and revert to draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareLinkDialog
        open={!!shareUrl}
        onOpenChange={(open) => !open && setShareUrl(null)}
        url={shareUrl ?? ""}
        kind="quote"
      />

      <AlertDialog open={!!pendingQuickQuote} onOpenChange={(open) => !open && setPendingQuickQuote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This section already has items</AlertDialogTitle>
            <AlertDialogDescription>
              Replace them with the Quick Quote line, or keep them and add it as a new line? Nothing is saved until you press
              Save changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => resolvePendingQuickQuote("add")}>
              Add as a new line
            </Button>
            <AlertDialogAction onClick={() => resolvePendingQuickQuote("replace")}>Replace items in this section</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuickQuoteDialog
        open={quickQuotePickerOpen}
        onOpenChange={(open) => {
          setQuickQuotePickerOpen(open);
          // Dismissed without picking — forget which section it was for.
          if (!open) setQuickQuoteSectionId(null);
        }}
        onPick={(buildTypeId) => {
          setQuickQuoteBuildType(buildTypeId);
          setQuickQuotePickerOpen(false);
        }}
      />
      {quickQuoteBuildType &&
        (() => {
          const template = findQuickQuoteTemplate(quickQuoteBuildType);
          if (!template) return null;
          return (
            <QuickQuoteFormDialog
              open={!!quickQuoteBuildType}
              onOpenChange={(open) => {
                if (open) return;
                setQuickQuoteBuildType(null);
                setQuickQuoteSectionId(null);
              }}
              template={template}
              rates={quickQuoteRates}
              catalogItems={catalogItems}
              // A section's own Quick Quote fills that section; the page-level
              // one adds a new section.
              onCreate={(result) =>
                quickQuoteSectionId
                  ? applySectionQuickQuote(quickQuoteSectionId, result, quickQuoteBuildType)
                  : addQuickQuoteSection(result, quickQuoteBuildType)
              }
              projectId={quote.project_id}
              featureId={quickQuoteSectionId ? draft.sections.find((s) => s.id === quickQuoteSectionId)?.feature_id ?? null : null}
            />
          );
        })()}

    </div>
  );
}

// ---------------------------------------------------------------------------

interface MaterialsAction {
  label: string;
  onClick: () => void;
  /** Primary until a materials sheet is attached (it's how real cost and
   * margin appear); then a quiet secondary link. */
  primary: boolean;
}

interface QuoteSummaryCardProps {
  /** "mobile" = full-width bottom card; "desktop" = 340px sidebar card. */
  variant: "mobile" | "desktop";
  /** The standalone "Create project" nudge — saves any unsaved changes
   * first (same saveMut the Save button uses) so the new project gets
   * whatever's currently in the editor, then navigates to create it. */
  onCreateProject: () => void;
  /** Required + selected-optional items — no tax (removed; it was a
   * fabricated demo estimate, never real). Matches quoteTotal() (api.ts)
   * and every other place a quote's total is shown. */
  total: number;
  /** Required-items-only subtotal — shown as a secondary "Base (required)"
   * line under the headline. */
  baseTotal: number;
  /** Sum of the optional section/items the client has actually selected —
   * 0 when none are selected, in which case both secondary lines are
   * hidden (baseTotal would just equal total, redundantly). */
  optionalTotal: number;
  optionalCount: number;
  /** Null for a standalone quote, or a project without a Cost plan yet —
   * no real cost source, so this and profit/marginPct show "Not
   * available" rather than a guessed number. */
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  materialsAction: MaterialsAction;
  /** Internal true-cost summary (overhead, break-even, fully loaded). */
  trueCost?: (collapsible: boolean) => React.ReactNode;
  depositPct: number;
  deposit: number;
  sendLabel: string;
  sendDisabled?: boolean;
  onSend: () => void;
  previewLabel: string;
  previewDisabled?: boolean;
  onPreview: () => void;
}

/**
 * Quote total + margin + deposit/cost/profit + expandable breakdown, with
 * its own Send/Preview actions. Used both as the sticky-free bottom card on
 * mobile and as a card in the desktop right rail — same content, tuned
 * sizing per breakpoint (see the "Quote Summary Card" design mockup).
 */
function QuoteSummaryCard({
  variant,
  onCreateProject,
  total,
  baseTotal,
  optionalTotal,
  optionalCount,
  cost,
  profit,
  marginPct,
  materialsAction,
  trueCost,
  depositPct,
  deposit,
  sendLabel,
  sendDisabled,
  onSend,
  previewLabel,
  previewDisabled,
  onPreview,
}: QuoteSummaryCardProps) {
  const isMobile = variant === "mobile";

  return (
    <div
      className={cn(
        "card-surface flex flex-col",
        isMobile ? "gap-4 rounded-3xl p-[18px] shadow-card-hover" : "gap-[18px] p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
            Quote total
          </div>
          <div
            className={cn(
              "mt-1 font-extrabold leading-none tracking-tight tabular-nums text-foreground",
              isMobile ? "text-[34px]" : "text-[30px]",
            )}
          >
            {formatCurrency(total)}
          </div>
        </div>
        {marginPct != null && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 font-extrabold text-success",
              isMobile ? "h-[30px] px-3.5 text-xs" : "h-7 px-3 text-xs",
            )}
          >
            Margin {marginPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Base + optional breakdown — the headline above is already their
          sum, so this is just showing what it's made of. Hidden entirely
          when the quote has no optional sections/items, so nothing changes
          for a quote that doesn't use them. */}
      {optionalCount > 0 && (
        <div className="flex flex-col gap-1 border-t border-hairline pt-3 text-xs font-semibold text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Base (required)</span>
            <span className="tabular-nums">{formatCurrency(baseTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Optional items ({optionalCount})</span>
            <span className="tabular-nums">{formatCurrency(optionalTotal)}</span>
          </div>
        </div>
      )}

      {isMobile ? (
        <div className="grid grid-cols-3 gap-2">
          <SummaryTile label={`Deposit ${depositPct}%`} value={formatCurrency(deposit)} />
          <SummaryTile
            label="Est. cost"
            value={
              cost == null ? (
                <span className="text-[13px] font-extrabold text-foreground">Not available</span>
              ) : (
                <span>{formatCurrency(cost)}</span>
              )
            }
          />
          <SummaryTile
            label="Estimated profit"
            value={profit == null ? "Not available" : formatCurrency(profit)}
            highlight
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <SummaryRow label={`Deposit ${depositPct}%`} value={formatCurrency(deposit)} />
          <SummaryRow
            label="Est. cost"
            value={
              cost == null ? (
                <span className="text-sm font-extrabold text-foreground">Not available</span>
              ) : (
                <span>{formatCurrency(cost)}</span>
              )
            }
          />
          <SummaryRow label="Profit" value={profit == null ? "Not available" : formatCurrency(profit)} highlight />
        </div>
      )}

      {trueCost?.(isMobile) && <div className="border-t border-hairline pt-3">{trueCost(isMobile)}</div>}

      {materialsAction.primary ? (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <Button
            type="button"
            variant="outline"
            onClick={materialsAction.onClick}
            className="h-10 w-full border-primary/50 font-bold text-primary hover:bg-primary/10"
          >
            <Layers className="mr-1.5 h-4 w-4" />
            {materialsAction.label}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            A cost plan is how this quote gets a real cost, profit and margin.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={materialsAction.onClick}
          className="-mt-2 inline-flex items-center gap-1.5 self-start text-xs font-bold text-primary hover:underline"
        >
          <Layers className="h-3.5 w-3.5" />
          {materialsAction.label}
        </button>
      )}

      <div className="flex gap-2.5">
        <Button
          onClick={onSend}
          disabled={sendDisabled}
          className={cn("flex-1 font-bold", isMobile ? "h-[46px] rounded-[13px]" : "h-11 rounded-xl")}
        >
          {sendLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onPreview}
          disabled={previewDisabled}
          className={cn("flex-1", isMobile ? "h-[46px] rounded-[13px]" : "h-11 rounded-xl")}
        >
          {previewLabel}
        </Button>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5",
        highlight ? "border border-primary/40 bg-primary/10" : "bg-muted",
      )}
    >
      <div className={cn("text-[11px] font-semibold", highlight ? "text-success" : "text-muted-foreground")}>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[15px] font-extrabold tabular-nums",
          highlight ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3.5 py-3",
        highlight ? "border border-primary/40 bg-primary/10" : "bg-muted",
      )}
    >
      <span className={cn("text-xs font-semibold", highlight ? "text-success" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn("text-base font-extrabold tabular-nums", highlight ? "text-success" : "text-foreground")}
      >
        {value}
      </span>
    </div>
  );
}

interface ClientShareCardProps {
  clientId: string | null;
  clients: { id: string; name: string }[];
  onClientChange: (id: string | null) => void;
  projectId: string | null;
  projects: { id: string; name: string }[];
  onProjectChange: (id: string | null) => void;
  /** Standalone quote: the Project card runs the create-project flow. */
  onCreateProject: () => void;
  /** The quote builder's own unsaved-changes flag — passed straight through
   * to GoToProjectLink. */
  isDirty: boolean;
  /** Whether a share token already exists — drives the status dot/label. */
  hasToken: boolean;
  shareUrl: string | null;
  onShare: () => void;
  onCopy: () => void;
  actionsDisabled?: boolean;
}

/**
 * Client + Project pickers and the client-facing share link, unified into
 * one card (the "Client Share Card" design). Replaces the old separate
 * Client/Project select grid and the "Client link" card.
 */
function ClientShareCard({
  clientId,
  clients,
  onClientChange,
  projectId,
  projects,
  onProjectChange,
  isDirty,
  hasToken,
  shareUrl,
  onShare,
  onCopy,
  actionsDisabled,
  onCreateProject,
}: ClientShareCardProps) {
  const clientName = clients.find((c) => c.id === clientId)?.name;
  const clientInitial = clientName ? clientName.trim().charAt(0).toUpperCase() || "?" : "?";
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const pillTriggerClass =
    "h-auto items-center gap-2.5 rounded-xl border-none bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.14] focus:ring-2 focus:ring-primary focus:ring-offset-0 [&>span]:line-clamp-1";
  const pillLabelClass = "shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55";
  const pillValueClass = "min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background";
  const cardFocusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
      {/* Dark header — Client and Project as two equal, fully clickable
          cards (same width/height, stack on mobile):
          - Client card = a button that opens the change-client picker.
          - Project card = a link to the project (a full-card overlay, so
            cmd/ctrl-click still opens a new tab and the unsaved-changes
            warning still applies); a standalone quote's card runs the
            create-project flow instead. Its chevron is a separate control
            that moves the quote to another project / unlinks it — it sits
            above the overlay and never triggers navigation. */}
      <div className="grid gap-2.5 bg-foreground p-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setClientPickerOpen(true)}
          aria-label="Change client"
          title="Change client"
          className={cn("group flex w-full", pillTriggerClass, cardFocusClass)}
        >
          <span className="!flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">
            {clientInitial}
          </span>
          <span className={pillLabelClass}>Client</span>
          <span className={pillValueClass}>{clientName ?? "No client"}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-background/50 transition-colors group-hover:text-background" />
        </button>
        <ClientPickerDialog
          open={clientPickerOpen}
          onOpenChange={setClientPickerOpen}
          onSelect={onClientChange}
          allowClear
        />

        <div className={cn("group relative flex w-full cursor-pointer", pillTriggerClass, "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary")}>
          {projectId ? (
            <GoToProjectLink projectId={projectId} isDirty={isDirty} variant="overlay" />
          ) : (
            <button
              type="button"
              onClick={onCreateProject}
              aria-label="Create project"
              title="Create a project for this quote"
              className="absolute inset-0 rounded-xl focus-visible:outline-none"
            />
          )}
          <span className="pointer-events-none !flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Briefcase className="h-3.5 w-3.5" />
          </span>
          <span className={cn(pillLabelClass, "pointer-events-none")}>Project</span>
          <span className={cn(pillValueClass, "pointer-events-none")}>
            {projects.find((p) => p.id === projectId)?.name ?? "No project"}
          </span>
          <span className="pointer-events-none shrink-0 text-background/50 transition-colors group-hover:text-background">
            {projectId ? <ArrowRight className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </span>
          {/* Move/unlink — its own hit area, above the card link. */}
          <Select value={projectId ?? NONE} onValueChange={(v) => onProjectChange(v === NONE ? null : v)}>
            <SelectTrigger
              aria-label={projectId ? "Move this quote to another project" : "Link an existing project"}
              title={projectId ? "Move to another project" : "Link an existing project"}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 -my-1 -mr-1.5 ml-0.5 h-8 w-8 shrink-0 justify-center rounded-lg border-l border-white/15 bg-transparent p-0 text-background/70 hover:bg-white/15 hover:text-background focus:ring-2 focus:ring-primary focus:ring-offset-0 [&>svg]:opacity-100"
            >
              <span className="sr-only">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* White footer — link status + url + Share/Copy */}
      <div className="flex flex-wrap items-center gap-3.5 bg-card p-4">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn("h-[7px] w-[7px] shrink-0 rounded-full", hasToken ? "bg-primary" : "bg-border")}
            />
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
              {hasToken ? "Client link is live" : "Client link not sent yet"}
            </span>
          </div>
          <div className="truncate rounded-lg bg-muted px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
            {shareUrl ?? "Generated the first time you share or preview this quote"}
          </div>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={onShare}
            disabled={actionsDisabled}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={actionsDisabled}
            aria-label="Copy link"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-quote terms, editable (auto-growing like Notes). Pre-filled from the
 * contractor's default terms when the quote was created (createQuote);
 * editing here changes this quote only. "Save as my default terms" writes
 * this text to Settings > Quote defaults for future quotes. The two
 * summary rows are real, derived from this quote (validity + deposit).
 */
function QuoteTermsCard({
  validUntil,
  depositLabel,
  value,
  onChange,
  defaultTerms,
  onSaveAsDefault,
  savingDefault,
}: {
  validUntil: string;
  depositLabel: string;
  value: string;
  onChange: (value: string) => void;
  defaultTerms: string | null;
  onSaveAsDefault: () => void;
  savingDefault: boolean;
}) {
  const row = (label: string, v: string) => (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{v}</span>
    </div>
  );
  const matchesDefault = (defaultTerms ?? "").trim() === value.trim();
  return (
    <div className="card-surface p-4">
      <div className="text-base font-bold text-foreground">Terms</div>
      <div className="mt-2.5 space-y-2.5">
        {row("Valid until", validUntil)}
        {row("Deposit", depositLabel)}
      </div>
      <AutoGrowTextarea
        aria-label="Terms"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Payment terms, warranty, exclusions…"
        className="mt-3 py-2 text-[13px] leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {!value.trim() && defaultTerms ? (
          <button type="button" onClick={() => onChange(defaultTerms)} className="text-xs font-semibold text-primary hover:underline">
            Use my default terms
          </button>
        ) : (
          <span className="text-[11px] text-muted-subtle">Changes here apply to this quote only.</span>
        )}
        <button
          type="button"
          onClick={onSaveAsDefault}
          disabled={savingDefault || !value.trim() || matchesDefault}
          className="text-xs font-semibold text-primary hover:underline disabled:cursor-default disabled:text-muted-subtle disabled:no-underline"
        >
          {savingDefault ? "Saving…" : matchesDefault && value.trim() ? "Your default terms" : "Save as my default terms"}
        </button>
      </div>
    </div>
  );
}

/**
 * The row under a quote section's name in its dark header (0095): the
 * project-type chip (same component as the Materials Sheet), which
 * materials sheet sections this section's cost comes from, and — once
 * there are some — that material cost plus the section's margin against
 * its own price. Nothing materials-related shows until the quote has a
 * materials sheet to link to (see sheetSectionsForLinking).
 */
function QuoteSectionHeaderTags({
  section,
  price,
  typeOptions,
  allCategories,
  sheetSections,
  onTypeChange,
  onMaterialsChange,
  overheadRate,
  overheadSettings,
  targetMarginPct,
}: {
  section: DraftSection;
  price: number;
  typeOptions: Category[];
  allCategories: Category[];
  sheetSections: MaterialsSection[];
  onTypeChange: (jobCategoryId: string | null) => void;
  onMaterialsChange: (next: { mode: "auto" | "manual"; ids: string[] }) => void;
  /** Internal true cost for the feature's details (0110) — null: not set up. */
  overheadRate: number | null;
  overheadSettings: OverheadSettings | null;
  targetMarginPct: number | null;
}) {
  const linked = linkedSheetSectionsFor(section, section.materialIds, sheetSections);
  const cost = sheetSectionsCost(linked);
  // Linked but nothing entered yet → cost unknown (not a $0 cost / 100% margin).
  const priced = costPlanHasEntries(linked);
  const { marginPct } = sectionMargin(price, cost);
  const autoIds = autoMatchedSheetSections(section, sheetSections).map((s) => s.id);
  const marginTag = priced && marginPct != null && (
    <span
      className={cn("text-[11px] font-semibold tabular-nums", marginPct < 0 ? "text-destructive-foreground" : "text-background")}
    >
      Margin {marginPct.toFixed(0)}%
    </span>
  );

  // A feature's section (0105): its cost is that feature's Cost plan
  // section — fixed, nothing to pick.
  if (section.feature_id) {
    const typeName = allCategories.find((c) => c.id === section.job_category_id)?.name ?? "Feature";
    const hours = plannedManHours(linked, { all: true });
    const tc = trueCost({ direct: cost, manHours: hours, rate: overheadRate ?? 0, price, targetMarginPct });
    const pctText = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-full bg-white/[0.16] px-2.5 py-0.5 text-left text-[11px] font-semibold text-background hover:bg-white/[0.24]"
              aria-label={`${typeName} cost details`}
            >
              {typeName}
              <span className={cn("font-normal", linked.length === 0 && "text-background/60")}>
                {" · "}
                {linked.length === 0 ? "No cost plan section yet" : priced ? `Cost ${formatCurrency(cost)}` : "Not priced yet"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-1.5 p-3 text-sm tabular-nums" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{typeName} · internal</div>
            <DetailRow label="Section price" value={formatCurrency(price)} />
            <DetailRow label="Direct cost" value={priced ? formatCurrency(cost) : "Not priced yet"} />
            <DetailRow label="Expected margin" value={priced ? pctText(sectionMargin(price, cost).marginPct) : "—"} />
            {!priced ? null : overheadRate != null ? (
              <>
                <DetailRow
                  label="Allocated overhead"
                  value={formatCurrency(tc.overhead)}
                  sub={`${formatLabor(hours, overheadSettings)} × ${formatCurrency(overheadRate)}/hr`}
                />
                <DetailRow
                  label="Fully loaded margin"
                  value={`${formatCurrency(tc.fullyLoadedProfit)} · ${pctText(tc.fullyLoadedMarginPct)}`}
                  valueClass={TRUE_COST_STATUS_CLASS[tc.status]}
                />
              </>
            ) : (
              <SetUpOverheadLink className="block pt-1" />
            )}
          </PopoverContent>
        </Popover>
        {marginTag}
      </div>
    );
  }

  // One chip: "Outdoor Kitchen · Materials $1,240 ▾" (type + linked
  // materials together); the margin stays beside it.
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <SectionTypeChip
        value={section.job_category_id}
        options={typeOptions}
        allCategories={allCategories}
        onChange={onTypeChange}
        materials={{
          mode: section.materials_link_mode,
          manualIds: section.materialIds,
          autoMatchedIds: autoIds,
          sheetSections,
          cost,
          onChange: onMaterialsChange,
        }}
      />
      {marginTag}
    </div>
  );
}

/**
 * A quote section's "Quick quote" toolbar action (SectionToolbarAction,
 * shared with the Materials Sheet's "Calculate quantities"): the prompt
 * version — "Measurements available · Quick quote" — when the project has
 * site measurements for the section's feature; "Update quick quote" once
 * the section has a Quick Quote line.
 */
function SectionQuickQuoteAction({
  projectId,
  buildType,
  hasQuickQuote,
  onClick,
  featureId = null,
}: {
  projectId: string | null;
  buildType: string | null;
  hasQuickQuote: boolean;
  onClick: () => void;
  featureId?: string | null;
}) {
  const prefill = useMeasurementPrefill(projectId, buildType ?? "", !!buildType && !!projectId, featureId);
  const label = hasQuickQuote ? "Update quick quote" : "Quick quote";
  return (
    <SectionToolbarAction
      icon={Sparkles}
      label={label}
      measurements={!hasQuickQuote && prefill.sources.length > 0}
      onClick={onClick}
    />
  );
}

function DetailRow({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-muted-foreground">{label}</div>
        {sub && <div className="text-[11px] text-muted-subtle">{sub}</div>}
      </div>
      <div className={cn("shrink-0 text-right font-semibold text-foreground", valueClass)}>{value}</div>
    </div>
  );
}

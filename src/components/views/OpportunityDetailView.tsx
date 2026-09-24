import { useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  ImagePlus,
  Loader2,
  FileText,
  ArrowRight,
  Layers,
  ExternalLink,
  Link2,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { OPPORTUNITY_STAGES, opportunityStageMeta, quoteStatusMeta } from "@/lib/statusMeta";
import {
  getOpportunity,
  getProject,
  updateOpportunity,
  moveOpportunityStage,
  markOpportunityWon,
  getOrCreateOpportunityProject,
  linkOpportunityToProject,
  unlinkOpportunityProject,
  listProjectsForClient,
  listOpportunitiesForClient,
  listCategories,
  listMaterialsSheets,
  listMaterialsBySheet,
  listQuotes,
  quoteTotal,
  materialsCogs,
  createQuoteFromOpportunity,
  addQuoteSection,
  listProjectImages,
  addProjectImage,
  getSignedImageUrls,
  listActivitiesForOpportunity,
  logActivity,
  listTasksForOpportunity,
  setTaskCompleted,
  listAppointmentsForOpportunity,
  opportunityCategoryIds,
  setOpportunityCategories,
  setProjectCategories,
  type Opportunity,
  type OpportunityStage,
  type ActivityKind,
  type Task,
  type Appointment,
  type Project,
} from "@/lib/api";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { LeadSourceSelect } from "@/components/common/LeadSourceSelect";
import { ProjectMeasurementsCard } from "@/components/common/ProjectMeasurementsCard";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { TaskRow, CreateTaskDialog } from "@/components/views/TasksView";
import { AppointmentRow, CreateAppointmentDialog } from "@/components/views/AppointmentsView";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

const ACTIVITY_KIND_LABEL: Partial<Record<ActivityKind, string>> = {
  note: "Note",
  text: "Text",
  email: "Email",
  stage_changed: "Stage change",
  other: "Other",
};

export function OpportunityDetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: opportunity, isLoading, isError, error } = useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => getOpportunity(id),
  });

  const { data: project } = useQuery({
    queryKey: ["project", opportunity?.project_id],
    queryFn: () => getProject(opportunity!.project_id!),
    enabled: !!opportunity?.project_id,
  });

  const { data: openTasks = [] } = useQuery({
    queryKey: ["opportunity-tasks", id],
    queryFn: () => listTasksForOpportunity(id),
  });
  const nextTask = openTasks.find((t) => !t.completed);

  const { data: appointments = [] } = useQuery({
    queryKey: ["opportunity-appointments", id],
    queryFn: () => listAppointmentsForOpportunity(id),
  });
  const upcomingAppointment = appointments.find((a) => a.status === "scheduled");

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["opportunity", id] });
  const invalidateProjectLink = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ["opportunities"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateOpportunity>[1]) => updateOpportunity(id, patch),
    onSuccess: invalidate,
    onError,
  });
  const moveStageMut = useMutation({
    // "won" always goes through the full Won transaction — see PipelineView's
    // identical branch. Every other stage is a plain move.
    mutationFn: (toStage: OpportunityStage) =>
      toStage === "won" ? markOpportunityWon(id) : moveOpportunityStage(opportunity!, toStage),
    onSuccess: async (_data, toStage) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-activities", id] });
      if (toStage === "won") {
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        toast({ title: "Won — project ready" });
        // This page is a single-opportunity view (unlike the pipeline
        // board, where dragging a card to Won shouldn't yank the
        // contractor off the board) — Won means the sales motion is over
        // and the job lives on the project from here, so send them there.
        // The refetched opportunity carries the project_id even for the
        // "won with no project yet" fallback (apply_opportunity_won
        // creates one).
        const won = await getOpportunity(id);
        if (won.project_id) navigate(`/projects/${won.project_id}`);
      }
    },
    onError,
  });

  // Lazily creates the project the first time anything job-related happens
  // here (first cost plan, quote, photo or measurement) — see
  // getOrCreateOpportunityProject's own doc comment (api.ts). Shared by the
  // Estimate card and the stage banner's "Create cost plan" action. A cost
  // plan isn't its own record — every project has one (it rolls up the
  // project's Materials + Labor), so "creating" it just means making sure
  // the project exists and opening the project's Cost Plan page.
  const openCostPlanMut = useMutation({
    mutationFn: () => getOrCreateOpportunityProject(id),
    onSuccess: (projectId) => {
      invalidateProjectLink();
      navigate(`/projects/${projectId}/cost-plan`);
    },
    onError,
  });

  const createQuoteMut = useMutation({
    mutationFn: async (categoryNames: string[]) => {
      const quote = await createQuoteFromOpportunity(opportunity!);
      for (const [i, name] of categoryNames.entries()) {
        await addQuoteSection(quote.id, { name, sort_order: i });
      }
      return quote;
    },
    onSuccess: (quote) => {
      invalidateProjectLink();
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["opportunity-activities", id] });
      navigate(`/quotes/${quote.id}`);
    },
    onError,
  });

  const categoriesMut = useMutation({
    mutationFn: (categoryIds: string[]) =>
      opportunity?.project_id
        ? setProjectCategories(opportunity.project_id, categoryIds)
        : setOpportunityCategories(id, categoryIds),
    onSuccess: invalidateProjectLink,
    onError,
  });

  const [linkProjectDialogOpen, setLinkProjectDialogOpen] = useState(false);
  // Both scoped to this opportunity's client, and only fetched once the
  // picker actually opens — this dialog is the rare path (most jobs still
  // go through the automatic lazy-create), no reason to pay for it on
  // every page load.
  const { data: clientProjects = [] } = useQuery({
    queryKey: ["client-projects", opportunity?.client_id],
    queryFn: () => listProjectsForClient(opportunity!.client_id),
    enabled: linkProjectDialogOpen && !!opportunity?.client_id,
  });
  const { data: clientOpportunities = [] } = useQuery({
    queryKey: ["client-opportunities", opportunity?.client_id],
    queryFn: () => listOpportunitiesForClient(opportunity!.client_id),
    enabled: linkProjectDialogOpen && !!opportunity?.client_id,
  });
  // Projects already claimed by a different opportunity for this client —
  // hidden from the picker so the unique-index rejection almost never
  // actually gets hit; it's still the real backstop, just not the UX.
  const alreadyLinkedProjectIds = new Set(
    clientOpportunities.filter((o) => o.id !== id && o.project_id).map((o) => o.project_id!),
  );
  const linkCandidates = clientProjects.filter((p) => !alreadyLinkedProjectIds.has(p.id));

  const linkProjectMut = useMutation({
    mutationFn: (projectId: string) => linkOpportunityToProject(id, projectId),
    onSuccess: () => {
      invalidateProjectLink();
      setLinkProjectDialogOpen(false);
      toast({ title: "Project linked" });
    },
    onError,
  });
  const unlinkProjectMut = useMutation({
    mutationFn: () => unlinkOpportunityProject(id),
    onSuccess: () => {
      invalidateProjectLink();
      toast({ title: "Project unlinked" });
    },
    onError,
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const field = (key: keyof Opportunity, value: string | number | null) =>
    draft[key] ?? (value == null ? "" : String(value));
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const clearDraft = (key: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  const commitField = (key: keyof Opportunity, current: string | null) => {
    const value = draft[key];
    if (value === undefined) return;
    if (value === (current ?? "")) {
      clearDraft(key);
      return;
    }
    updateMut.mutate(
      { [key]: value.trim() === "" ? null : value.trim() },
      { onSuccess: () => clearDraft(key) },
    );
  };

  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (isError || !opportunity)
    return <p className="text-destructive">Failed to load opportunity: {(error as Error)?.message}</p>;

  const meta = opportunityStageMeta(opportunity.stage);
  const categoryIds = opportunityCategoryIds(opportunity);
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const categoryNames = categoryIds.map((cid) => categoryNameById.get(cid)).filter((n): n is string => !!n);

  return (
    <div className="animate-fade-in space-y-5">
      <Link to="/pipeline" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Input
            value={field("title", opportunity.title)}
            onChange={(e) => setField("title", e.target.value)}
            onBlur={() => commitField("title", opportunity.title)}
            className="h-auto border-none bg-transparent px-0 text-[28px] font-bold tracking-tight text-foreground shadow-none focus-visible:ring-0"
          />
          <p className="mt-1 text-sm text-muted-foreground">{opportunity.client?.name ?? "No client"}</p>
          {opportunity.project_id ? (
            <div className="mt-1 flex items-center gap-3">
              <Link
                to={`/projects/${opportunity.project_id}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                Open project <ExternalLink className="h-3 w-3" />
              </Link>
              <button
                type="button"
                onClick={() => unlinkProjectMut.mutate()}
                disabled={unlinkProjectMut.isPending}
                className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline"
              >
                Unlink
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLinkProjectDialogOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              <Link2 className="h-3 w-3" /> Link existing project
            </button>
          )}
        </div>
        <Select
          value={opportunity.stage}
          onValueChange={(v) => moveStageMut.mutate(v as OpportunityStage)}
        >
          <SelectTrigger className={cn("w-56", meta.badge, meta.tone === "greenSolid" && "!bg-success")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPPORTUNITY_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {opportunityStageMeta(s).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {opportunity.stage !== "won" && opportunity.stage !== "lost" && (
        <StageBanner
          opportunity={opportunity}
          nextTask={nextTask}
          upcomingAppointment={upcomingAppointment}
          openingCostPlan={openCostPlanMut.isPending}
          onScheduleVisit={() => setAppointmentDialogOpen(true)}
          onOpenCostPlan={() => openCostPlanMut.mutate()}
          onFollowUp={() => setTaskDialogOpen(true)}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card-surface space-y-4 p-5">
            <h3 className="text-base font-bold text-foreground">Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Property address</div>
                <Input
                  value={field("address", opportunity.address)}
                  onChange={(e) => setField("address", e.target.value)}
                  onBlur={() => commitField("address", opportunity.address)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Project types</div>
                <CategoryMultiSelect
                  value={categoryIds}
                  onChange={(ids) => categoriesMut.mutate(ids)}
                  placeholder="Select types…"
                />
              </div>
              <LeadSourceField
                value={opportunity.lead_source}
                onChange={(v) => updateMut.mutate({ lead_source: v })}
              />
            </div>
            <div className="space-y-1">
              <div className={FIELD_LABEL}>Description of requested work</div>
              <Textarea
                value={field("description", opportunity.description)}
                onChange={(e) => setField("description", e.target.value)}
                onBlur={() => commitField("description", opportunity.description)}
                rows={3}
              />
            </div>
            {/* Free-form notes (opportunities.measurements) — always editable.
                The structured project size lives on the project
                (ProjectSizeCard below). */}
            <div className="space-y-1">
              <div className={FIELD_LABEL}>Measurement notes</div>
              <Textarea
                value={field("measurements", opportunity.measurements)}
                onChange={(e) => setField("measurements", e.target.value)}
                onBlur={() => commitField("measurements", opportunity.measurements)}
                placeholder="e.g. 600 sq ft patio, 8ft island"
                rows={2}
              />
            </div>
            {opportunity.stage === "lost" && (
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Lost reason</div>
                <Textarea
                  value={field("lost_reason", opportunity.lost_reason)}
                  onChange={(e) => setField("lost_reason", e.target.value)}
                  onBlur={() => commitField("lost_reason", opportunity.lost_reason)}
                  rows={2}
                />
              </div>
            )}
          </section>

          <ProjectMeasurementsCard
            projectId={opportunity.project_id}
            categoryIds={categoryIds}
            ensureProjectId={() => getOrCreateOpportunityProject(id)}
            onSaved={invalidateProjectLink}
          />

          <OpportunityPhotosSection projectId={opportunity.project_id} opportunityId={id} onProjectCreated={invalidateProjectLink} />
        </div>

        <div className="space-y-5">
          <EstimateCard
            opportunity={opportunity}
            projectId={opportunity.project_id}
            categoryNames={categoryNames}
            openingCostPlan={openCostPlanMut.isPending}
            creatingQuote={createQuoteMut.isPending}
            onOpenCostPlan={() => openCostPlanMut.mutate()}
            onCreateQuote={(names) => createQuoteMut.mutate(names)}
          />
          <OpportunityAppointmentsCard
            opportunityId={id}
            clientId={opportunity.client_id}
            open={appointmentDialogOpen}
            onOpenChange={setAppointmentDialogOpen}
          />
          <OpportunityTasksCard
            opportunityId={id}
            clientId={opportunity.client_id}
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
          />
          <OpportunityActivityCard opportunityId={id} clientId={opportunity.client_id} />
        </div>
      </div>

      <LinkProjectDialog
        open={linkProjectDialogOpen}
        onOpenChange={setLinkProjectDialogOpen}
        hasOtherProjects={clientProjects.length > 0}
        candidates={linkCandidates}
        onSelect={(projectId) => linkProjectMut.mutate(projectId)}
      />
    </div>
  );
}

/** The opportunity page's "Link existing project" picker — same row-button
 * shape as QuoteWorkspace's LinkMaterialsSheetDialog, scoped to this
 * opportunity's client and pre-filtered to exclude projects already linked
 * to a different opportunity (see alreadyLinkedProjectIds above). */
function LinkProjectDialog({
  open,
  onOpenChange,
  hasOtherProjects,
  candidates,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasOtherProjects: boolean;
  candidates: Project[];
  onSelect: (projectId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Link an existing project</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasOtherProjects
                ? "Every project for this client is already linked to a different opportunity."
                : "This client has no other projects yet."}
            </p>
          ) : (
            candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 pl-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                  {p.address && <span className="block truncate text-xs text-muted-foreground">{p.address}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Changes with the stage — always the single next thing to do, straight to
 * the right form. Hidden entirely once the lead is Won or Lost (both are
 * terminal; there's no "next step" on the sales side anymore).
 */
function StageBanner({
  opportunity,
  nextTask,
  upcomingAppointment,
  openingCostPlan,
  onScheduleVisit,
  onOpenCostPlan,
  onFollowUp,
}: {
  opportunity: Opportunity;
  nextTask: Task | undefined;
  upcomingAppointment: Appointment | undefined;
  openingCostPlan: boolean;
  onScheduleVisit: () => void;
  onOpenCostPlan: () => void;
  onFollowUp: () => void;
}) {
  const content = (() => {
    switch (opportunity.stage) {
      case "new_lead":
        return {
          text: "Start planning the job.",
          action: openingCostPlan ? "Opening…" : "Create cost plan",
          onClick: onOpenCostPlan,
        };
      case "contacted":
        return { text: "Ready to schedule a site visit?", action: "Schedule site visit", onClick: onScheduleVisit };
      case "site_visit_scheduled":
        return upcomingAppointment
          ? {
              text: `Site visit scheduled for ${new Date(upcomingAppointment.date_time).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}.`,
              action: null,
              onClick: undefined,
            }
          : { text: "Site visit scheduled.", action: null, onClick: undefined };
      case "site_visit_done":
        return {
          text: "Time to price the job.",
          action: openingCostPlan ? "Opening…" : "Create cost plan",
          onClick: onOpenCostPlan,
        };
      case "proposal_sent":
        return {
          text: nextTask
            ? `Next: ${nextTask.title}${nextTask.due_at ? ` · ${new Date(nextTask.due_at).toLocaleDateString()}` : ""}`
            : "Waiting on the client — worth a follow-up?",
          action: "Follow up",
          onClick: onFollowUp,
        };
      case "revisions":
        return {
          text: "The client asked for changes — a revised quote is owed.",
          action: "Revise and resend quote",
          onClick: undefined,
          to: opportunity.project_id ? `/projects/${opportunity.project_id}/quotes` : undefined,
        };
      default:
        return null;
    }
  })();

  if (!content) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="text-sm font-semibold text-foreground">{content.text}</p>
      {content.action &&
        (content.to ? (
          <Button asChild size="sm" className="shrink-0 font-bold">
            <Link to={content.to}>
              {content.action} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : content.onClick ? (
          <Button size="sm" className="shrink-0 font-bold" onClick={content.onClick} disabled={openingCostPlan}>
            {content.action} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : null)}
    </div>
  );
}

function LeadSourceField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1">
      <div className={FIELD_LABEL}>Lead source</div>
      <LeadSourceSelect value={value} onChange={onChange} />
    </div>
  );
}

/**
 * Replaces the old "Quote" card. Cost plan first, quote second —
 * "Create cost plan" is the primary action (opens the project's Cost Plan,
 * where materials + labor get planned). Once a project exists,
 * every sheet + quote on it shows as its own row (multiple options — e.g.
 * basic patio vs. patio + fire pit — are just multiple sheets/quotes on
 * the same project, linked via the existing LinkedDocumentBar rules once
 * there's more than one of either). Creating a quote never blocks on a
 * missing sheet — it just can't show a margin yet.
 */
function EstimateCard({
  opportunity,
  projectId,
  categoryNames,
  openingCostPlan,
  creatingQuote,
  onOpenCostPlan,
  onCreateQuote,
}: {
  opportunity: Opportunity;
  projectId: string | null;
  /** Selected job types (Details card's Project types field), offered as a
   * starting structure — see the "start with a section per type" toggle
   * below. */
  categoryNames: string[];
  openingCostPlan: boolean;
  creatingQuote: boolean;
  onOpenCostPlan: () => void;
  onCreateQuote: (categoryNames: string[]) => void;
}) {
  const { data: sheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: projectId }],
    queryFn: () => listMaterialsSheets(projectId!),
    enabled: !!projectId,
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId!),
    enabled: !!projectId,
  });
  // Defaults on whenever there's something to pre-add and nothing exists
  // yet — once a sheet/quote already exists, later ones are almost always
  // a revision or a second option, not a fresh starting structure.
  const [preAddSections, setPreAddSections] = useState(true);
  const offerPreAdd = categoryNames.length > 0 && sheets.length === 0 && quotes.length === 0;

  return (
    <section className="card-surface space-y-3 p-5">
      <h3 className="text-base font-bold text-foreground">Estimate</h3>

      {sheets.length === 0 && quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No material sheet or quote yet.</p>
      ) : (
        <div className="space-y-2">
          {sheets.map((sheet) => (
            <Link
              key={sheet.id}
              to={`/projects/${projectId}/materials/${sheet.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0 text-muted-subtle" />
                <span className="text-sm font-semibold text-foreground">{sheet.name}</span>
              </div>
              <SheetCostBadge sheetId={sheet.id} />
            </Link>
          ))}
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              to={`/quotes/${quote.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-subtle" />
                <span className="text-sm font-bold text-foreground">{formatCurrency(quoteTotal(quote.quote_sections))}</span>
              </div>
              <span className={quoteStatusMeta(quote.status).badge}>{quoteStatusMeta(quote.status).label}</span>
            </Link>
          ))}
        </div>
      )}

      {quotes.length > 0 && sheets.length === 0 && (
        <p className="text-xs text-muted-subtle">No material sheet — margin won't be visible.</p>
      )}

      {offerPreAdd && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={preAddSections}
            onCheckedChange={(v) => setPreAddSections(v === true)}
            className="mt-0.5"
          />
          Start the quote with a section per project type ({categoryNames.join(", ")})
        </label>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <Button size="sm" className="font-bold" disabled={openingCostPlan} onClick={onOpenCostPlan}>
          <Calculator className="mr-2 h-3.5 w-3.5" />
          {openingCostPlan ? "Opening…" : "Create cost plan"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={creatingQuote}
          onClick={() => onCreateQuote(offerPreAdd && preAddSections ? categoryNames : [])}
        >
          <FileText className="mr-2 h-3.5 w-3.5" />
          {creatingQuote ? "Creating…" : "Create quote"}
        </Button>
      </div>

      {opportunity.stage === "won" && !quotes.some((q) => q.status === "approved") && (
        <p className="text-xs font-semibold text-warning-strong">Won manually — no signed quote on file.</p>
      )}
    </section>
  );
}

/** A sheet's own cost total — fetched per-row since EstimateCard only
 * lists sheets, not their sections/items. */
function SheetCostBadge({ sheetId }: { sheetId: string }) {
  const { data: sections = [] } = useQuery({
    queryKey: ["materials-sections", { sheet: sheetId }],
    queryFn: () => listMaterialsBySheet(sheetId),
  });
  const cost = materialsCogs(sections);
  return <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(cost)}</span>;
}

function OpportunityAppointmentsCard({
  opportunityId,
  clientId,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: appointments = [] } = useQuery({
    queryKey: ["opportunity-appointments", opportunityId],
    queryFn: () => listAppointmentsForOpportunity(opportunityId),
  });

  const upcoming = appointments.filter((a) => a.status === "scheduled");

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Appointments</h3>
        <button type="button" onClick={() => onOpenChange(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No upcoming appointments.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {upcoming.map((a) => (
            <AppointmentRow key={a.id} appointment={a} />
          ))}
        </div>
      )}
      <CreateAppointmentDialog open={open} onOpenChange={onOpenChange} defaultClientId={clientId} defaultOpportunityId={opportunityId} />
    </section>
  );
}

function OpportunityTasksCard({
  opportunityId,
  clientId,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [] } = useQuery({
    queryKey: ["opportunity-tasks", opportunityId],
    queryFn: () => listTasksForOpportunity(opportunityId),
  });

  const completeMut = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => setTaskCompleted(id, completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity-tasks", opportunityId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Completed tasks stay in the list (struck through by TaskRow) below the
  // open ones, so checking one off never makes it vanish — unchecking
  // restores it. listTasksForOpportunity already returns both, due-date
  // sorted; this is a stable partition that keeps that order within each.
  const sorted = [...tasks.filter((t) => !t.completed), ...tasks.filter((t) => t.completed)];

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Tasks</h3>
        <button type="button" onClick={() => onOpenChange(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {sorted.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={(v) => completeMut.mutate({ id: t.id, completed: v })} />
          ))}
        </div>
      )}
      <CreateTaskDialog open={open} onOpenChange={onOpenChange} defaultClientId={clientId} defaultOpportunityId={opportunityId} />
    </section>
  );
}

/**
 * Site photos — the project's own PhotoGallery (Phase 3), reused as-is.
 * Before a project exists, a minimal upload trigger lazily creates one
 * (getOrCreateOpportunityProject) on the very first photo, then hands off
 * to the real gallery for everything after — nothing about PhotoGallery
 * itself changes; opportunity_photos (the old separate table) is never
 * read or written anymore.
 */
function OpportunityPhotosSection({
  projectId,
  opportunityId,
  onProjectCreated,
}: {
  projectId: string | null;
  opportunityId: string;
  onProjectCreated: () => void;
}) {
  if (projectId) {
    return (
      <PhotoGallery owner={{ type: "project", id: projectId }} title="Site photos" emptyText="No photos yet." internalOnly />
    );
  }
  return <FirstPhotoUploader opportunityId={opportunityId} onProjectCreated={onProjectCreated} />;
}

function FirstPhotoUploader({
  opportunityId,
  onProjectCreated,
}: {
  opportunityId: string;
  onProjectCreated: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const projectId = await getOrCreateOpportunityProject(opportunityId);
      await addProjectImage(projectId, file, { sort_order: 0 });
    },
    onMutate: () => setPending(true),
    onSettled: () => setPending(false),
    onSuccess: onProjectCreated,
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Site photos</h3>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          className="flex aspect-square w-24 items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add first photo"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) uploadMut.mutate(file);
          }}
        />
      </div>
    </section>
  );
}

function OpportunityActivityCard({
  opportunityId,
  clientId,
}: {
  opportunityId: string;
  clientId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: activities = [] } = useQuery({
    queryKey: ["opportunity-activities", opportunityId],
    queryFn: () => listActivitiesForOpportunity(opportunityId),
  });

  const logMut = useMutation({
    // No type picker here — every manual entry on the opportunity is a note.
    mutationFn: () => logActivity(clientId, "note", body.trim(), { opportunity_id: opportunityId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity-activities", opportunityId] });
      // A text/email/note just logged also stamped last_contact_date
      // automatically (migration 0078) — refresh the opportunity so it shows.
      qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
      setBody("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Activity</h3>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Log an update…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && body.trim()) logMut.mutate();
            }}
          />
        </div>
        <Button size="sm" disabled={!body.trim() || logMut.isPending} onClick={() => logMut.mutate()}>
          {logMut.isPending ? "Logging…" : "Log activity"}
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="border-b border-hairline pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-subtle">
                  {ACTIVITY_KIND_LABEL[a.kind as ActivityKind] ?? a.kind}
                </span>
                <span className="text-[11px] text-muted-subtle">{timeAgo(a.created_at)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-foreground/80">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

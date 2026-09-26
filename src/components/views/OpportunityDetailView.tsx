import { useRef, useState } from "react";
import { costPlanTotal } from "@/lib/costPlanMath";
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
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
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
import { cn, formatCurrency, formatPhone, phoneHref, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { OPPORTUNITY_STAGES, opportunityStageMeta, quoteStatusMeta } from "@/lib/statusMeta";
import {
  getOpportunity,
  getProject,
  updateOpportunity,
  moveOpportunityStage,
  markOpportunityWon,
  getOrCreateOpportunityProject,
  getClient,
  setAppointmentStatus,
  linkOpportunityToProject,
  unlinkOpportunityProject,
  listProjectsForClient,
  listOpportunitiesForClient,
  listCategories,
  listMaterialsSheets,
  listSmartSectionSettings,
  getOrCreateCostPlan,
  addFeatureQuoteSections,
  pickHeadlineQuote,
  type MaterialsSheet,
  type Quote,
  projectCategoryIds,
  listMaterialsBySheet,
  listQuotes,
  quoteTotal,
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
  setProjectFeatureTypes,
  type Opportunity,
  type OpportunityStage,
  type ActivityKind,
  type Appointment,
  type Client,
  type Project,
} from "@/lib/api";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { LeadSourceSelect } from "@/components/common/LeadSourceSelect";
import { ProjectMeasurementsCard } from "@/components/common/ProjectMeasurementsCard";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { MeasuredCategoryMultiSelect } from "@/components/measurements/MeasuredCategoryMultiSelect";
import { addonQuoteNumbers } from "@/lib/featureFinancials";
import { TaskRow, CreateTaskDialog } from "@/components/views/TasksView";
import { AppointmentRow, CreateAppointmentDialog, EditAppointmentDialog } from "@/components/views/AppointmentsView";
import { overdueSiteVisit, siteVisitDateLabel } from "@/lib/siteVisitCheck";
import { appointmentWhenLabel } from "@/lib/appointmentTime";
import { invalidateAppointmentQueries } from "@/lib/appointmentQueries";
import { BackLink } from "@/components/common/BackLink";

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

  // The one "what estimate documents exist" check for this opportunity's
  // project — the Estimate card, the stage banner and the Appointments
  // card's "Start estimate" all follow it, so none of them ever creates a
  // second sheet/quote when one already exists.
  const { sheets: estimateSheets, quotes: estimateQuotes } = useEstimateDocs(opportunity?.project_id ?? null);
  const hasCostPlan = estimateSheets.length > 0;

  const { data: appointments = [] } = useQuery({
    queryKey: ["opportunity-appointments", id],
    queryFn: () => listAppointmentsForOpportunity(id),
  });
  const upcomingAppointment = appointments.find((a) => a.status === "scheduled");
  // A site visit whose date passed without being checked off — the banner
  // asks whether it happened (same rule as Needs you / the Pipeline board).
  const overdueVisit = opportunity ? overdueSiteVisit(opportunity, appointments) : undefined;

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  // New Lead banner shows the client's phone, and an empty Property address
  // offers the client's address — the opportunity query only joins the
  // client's name. Same cache key as the client page.
  const { data: client } = useQuery({
    queryKey: ["client", opportunity?.client_id],
    queryFn: () => getClient(opportunity!.client_id),
    enabled: !!opportunity?.client_id && (opportunity.stage === "new_lead" || !opportunity.address),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["opportunity", id] });
  const invalidateProjectLink = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ["opportunities"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project-features"] });
    qc.invalidateQueries({ queryKey: ["materials"] });
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
      // Any move into or out of Won shows/hides the linked project in every
      // project list (isPreSaleProject) — refresh them on every move.
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["client-projects"] });
      if (opportunity?.project_id) qc.invalidateQueries({ queryKey: ["project", opportunity.project_id] });
      if (toStage === "won") {
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
  // Estimate card and the stage banner's "Create cost plan" action. Every
  // project has exactly one Cost plan (0106); the first open creates it with
  // one section per project feature plus General (getOrCreateCostPlan).
  const openCostPlanMut = useMutation({
    mutationFn: async () => {
      const projectId = await getOrCreateOpportunityProject(id);
      await getOrCreateCostPlan(projectId);
      return projectId;
    },
    onSuccess: (projectId) => {
      invalidateProjectLink();
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["materials", { project: projectId }] });
      navigate(`/projects/${projectId}/materials`);
    },
    onError,
  });
  /** "Create cost plan" / "Open cost plan" everywhere on this page. */
  const openOrCreateCostPlan = () =>
    opportunity?.project_id && hasCostPlan ? navigate(`/projects/${opportunity.project_id}/materials`) : openCostPlanMut.mutate();
  /** "Create quote" / "Open quote": the headline quote once one exists. */
  const openOrCreateQuote = (withSectionPerType: boolean) => {
    const headline = pickHeadlineQuote(estimateQuotes);
    if (headline) navigate(`/quotes/${headline.id}`);
    else createQuoteMut.mutate(withSectionPerType);
  };

  // Won banner's "Go to project" and Revisions' "Open project view". If the
  // opportunity has no project yet, create/get it first.
  const goToProjectMut = useMutation({
    mutationFn: async () => opportunity!.project_id ?? (await getOrCreateOpportunityProject(id)),
    onSuccess: (projectId) => {
      if (projectId !== opportunity?.project_id) invalidateProjectLink();
      navigate(`/projects/${projectId}`);
    },
    onError,
  });

  // "Yes, mark completed" on the overdue-visit prompt — the same completion
  // as the appointment checkbox, so it also advances to Site Visit Done.
  const confirmVisitMut = useMutation({
    mutationFn: (visit: Appointment) => setAppointmentStatus(visit, "completed", visit.outcome),
    onSuccess: (_d, visit) => invalidateAppointmentQueries(qc, visit.client_id, visit.opportunity_id),
    onError,
  });
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Optionally starts the quote with one section per project type — each
  // named AND tagged with its type (job_category_id), same as a new
  // materials sheet's sections, so its chip and materials auto-link work
  // from the start.
  const createQuoteMut = useMutation({
    mutationFn: async (withSectionPerType: boolean) => {
      const quote = await createQuoteFromOpportunity(opportunity!);
      if (withSectionPerType) {
        // One section per project feature (0105); before 0105 (no feature
        // records yet) one per project type, as before.
        const added = quote.project_id ? await addFeatureQuoteSections(quote.id, quote.project_id, categories) : 0;
        if (added === 0) {
          const types = opportunityCategoryIds(opportunity!)
            .map((cid) => categories.find((c) => c.id === cid))
            .filter((c): c is NonNullable<typeof c> => !!c);
          for (const [i, t] of types.entries()) {
            await addQuoteSection(quote.id, { name: t.name, sort_order: i, job_category_id: t.id });
          }
        }
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
        ? setProjectFeatureTypes(opportunity.project_id, categoryIds)
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
      <BackLink to="/pipeline" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">Pipeline</BackLink>

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

      {opportunity.stage !== "lost" && (
        <StageBanner
          opportunity={opportunity}
          client={client}
          movingStage={moveStageMut.isPending}
          onMarkContacted={() => moveStageMut.mutate("contacted")}
          onClientWantsChanges={() => moveStageMut.mutate("revisions")}
          costPlanStarted={hasCostPlan}
          upcomingAppointment={upcomingAppointment}
          overdueVisit={overdueVisit}
          confirmingVisit={confirmVisitMut.isPending}
          onConfirmVisit={() => overdueVisit && confirmVisitMut.mutate(overdueVisit)}
          onRescheduleVisit={() => setRescheduleOpen(true)}
          openingCostPlan={openCostPlanMut.isPending}
          openingProject={goToProjectMut.isPending}
          onScheduleVisit={() => setAppointmentDialogOpen(true)}
          onOpenCostPlan={openOrCreateCostPlan}
          onGoToProject={() => goToProjectMut.mutate()}
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
                {/* Older opportunities were saved without one — offer the
                    client's address, never fill it in silently. */}
                {!opportunity.address && !field("address", opportunity.address) && client?.address && (
                  <button
                    type="button"
                    onClick={() => updateMut.mutate({ address: client.address })}
                    disabled={updateMut.isPending}
                    className="text-left text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Use client's address: {client.address}
                  </button>
                )}
              </div>
              <MeasuredCategoryMultiSelect
                projectId={opportunity.project_id}
                value={categoryIds}
                onChange={(ids) => categoriesMut.mutate(ids)}
                variant="compact"
              />
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
            {/* Internal site-condition notes (opportunities.site_conditions,
                0099 — was "measurements"). Real measurements live in the
                Measurements card below. Never shown to the client. Grows
                with the text like the quote builder's Notes. */}
            <div className="space-y-1">
              <label htmlFor="opp-site-conditions" className={FIELD_LABEL}>
                Site condition notes
              </label>
              <p className="text-xs text-muted-foreground">
                Access, slope, drainage, soil, utilities, anything that affects the job. Fill in during or after the site visit.
              </p>
              <AutoGrowTextarea
                id="opp-site-conditions"
                rows={3}
                value={field("site_conditions", opportunity.site_conditions)}
                onChange={(e) => setField("site_conditions", e.target.value)}
                onBlur={() => commitField("site_conditions", opportunity.site_conditions)}
                placeholder='e.g. Narrow side gate (36"), slight slope toward house, old concrete pad to remove, sprinkler lines along fence.'
                className="py-2 text-sm leading-relaxed"
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
            hint={MEASUREMENTS_HINT}
          />

          <OpportunityPhotosSection projectId={opportunity.project_id} opportunityId={id} onProjectCreated={invalidateProjectLink} />
        </div>

        <div className="space-y-5">
          <EstimateCard
            opportunity={opportunity}
            projectId={opportunity.project_id}
            sheets={estimateSheets}
            quotes={estimateQuotes}
            categoryNames={categoryNames}
            openingCostPlan={openCostPlanMut.isPending}
            creatingQuote={createQuoteMut.isPending}
            onCostPlan={openOrCreateCostPlan}
            onQuote={openOrCreateQuote}
          />
          <OpportunityAppointmentsCard
            opportunityId={id}
            clientId={opportunity.client_id}
            open={appointmentDialogOpen}
            onOpenChange={setAppointmentDialogOpen}
            estimateAction={{
              label: hasCostPlan ? "Open cost plan →" : "Start estimate →",
              onClick: openOrCreateCostPlan,
              pending: openCostPlanMut.isPending,
            }}
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

      {overdueVisit && (
        <EditAppointmentDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} appointment={overdueVisit} />
      )}

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
  client,
  movingStage,
  onMarkContacted,
  onClientWantsChanges,
  costPlanStarted,
  upcomingAppointment,
  overdueVisit,
  confirmingVisit,
  onConfirmVisit,
  onRescheduleVisit,
  openingCostPlan,
  openingProject,
  onScheduleVisit,
  onOpenCostPlan,
  onGoToProject,
  onFollowUp,
}: {
  opportunity: Opportunity;
  client: Pick<Client, "id" | "name" | "phone" | "email"> | undefined;
  /** The stage dropdown's own mutation is running (Mark as contacted /
   * Client wants changes use it too). */
  movingStage: boolean;
  onMarkContacted: () => void;
  onClientWantsChanges: () => void;
  costPlanStarted: boolean;
  upcomingAppointment: Appointment | undefined;
  overdueVisit: Appointment | undefined;
  confirmingVisit: boolean;
  onConfirmVisit: () => void;
  onRescheduleVisit: () => void;
  openingCostPlan: boolean;
  openingProject: boolean;
  onScheduleVisit: () => void;
  onOpenCostPlan: () => void;
  onGoToProject: () => void;
  onFollowUp: () => void;
}) {
  const content = (() => {
    // Takes over from the stage's own message — the visit date has passed
    // and nobody said whether it happened.
    if (overdueVisit) {
      return {
        text: `Was the site visit on ${siteVisitDateLabel(overdueVisit)} completed?`,
        action: confirmingVisit ? "Saving…" : "Yes, mark completed",
        onClick: onConfirmVisit,
        secondary: { label: "Reschedule", onClick: onRescheduleVisit },
      };
    }
    switch (opportunity.stage) {
      case "new_lead": {
        const name = client?.name ?? opportunity.client?.name;
        const phone = client?.phone?.trim();
        return {
          text: name ? `New lead. Reach out to ${name}.` : "New lead. Reach out to the client.",
          // Plain tel: link only — no call logging (calls were removed
          // app-wide). No phone on file → link to the client's edit form.
          detail: phone ? (
            <a href={phoneHref(phone)} className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {formatPhone(phone)}
            </a>
          ) : client ? (
            <Link to={`/clients/${client.id}/edit`} className="font-semibold text-primary hover:underline">
              Add contact info
            </Link>
          ) : null,
          action: movingStage ? "Saving…" : "Mark as contacted",
          onClick: onMarkContacted,
        };
      }
      case "contacted":
        return { text: "Ready to schedule a site visit?", action: "Schedule site visit", onClick: onScheduleVisit };
      case "site_visit_scheduled":
        return upcomingAppointment
          ? {
              // "Fri, Sep 25 · 9:30 AM" (date only for a date-only appointment)
              text: `Site visit scheduled for ${appointmentWhenLabel(upcomingAppointment)}.`,
              action: null,
              onClick: undefined,
            }
          : { text: "Site visit scheduled.", action: null, onClick: undefined };
      case "site_visit_done":
        return {
          text: "Site visit done. Build the estimate.",
          action: openingCostPlan ? "Opening…" : costPlanStarted ? "Open cost plan" : "Create cost plan",
          onClick: onOpenCostPlan,
        };
      case "proposal_sent":
        return {
          text: "Waiting on the client — worth a follow-up?",
          action: "Follow up",
          onClick: onFollowUp,
          secondary: { label: movingStage ? "Saving…" : "Client wants changes", onClick: onClientWantsChanges },
        };
      case "revisions":
        return {
          text: "Client asked for revisions.",
          action: openingProject ? "Opening…" : "Open project view",
          onClick: onGoToProject,
        };
      case "won":
        return {
          text: "Won. This job is now a project.",
          action: openingProject ? "Opening…" : "Go to project",
          onClick: onGoToProject,
        };
      default:
        return null;
    }
  })();

  if (!content) return null;
  // Two buttons don't fit beside the message on a phone — stack them full
  // width under it below sm. Single-button banners keep the inline layout.
  const twoButtons = "secondary" in content && !!content.secondary;

  return (
    <div
      className={cn(
        "flex justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3",
        twoButtons ? "flex-col sm:flex-row sm:items-center" : "items-center",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{content.text}</p>
        {"detail" in content && content.detail && <p className="mt-0.5 text-[13px] text-muted-foreground">{content.detail}</p>}
      </div>
      <div className={cn("flex shrink-0 gap-2", twoButtons ? "flex-col-reverse sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto" : "items-center")}>
        {"secondary" in content && content.secondary && (
          <Button
            size="sm"
            variant="outline"
            className="font-bold"
            onClick={content.secondary.onClick}
            disabled={confirmingVisit || movingStage}
          >
            {content.secondary.label}
          </Button>
        )}
        {content.action && content.onClick && (
          <Button
            size="sm"
            className="shrink-0 font-bold"
            onClick={content.onClick}
            disabled={openingCostPlan || openingProject || movingStage || confirmingVisit}
          >
            {content.action} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
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
 * The opportunity's estimate: cost plan (materials sheet) first, quote
 * second. Every sheet and quote on the project is its own clickable row
 * (with its total, and the quote's status). The buttons follow what
 * exists — useEstimateDocs(), the one check shared with the stage banner
 * and the Appointments card:
 *   - "Create cost plan" → "Open cost plan" once it exists (a project has
 *     exactly one; it starts with a section per project feature).
 *   - "Create quote" → "Open quote" once a quote exists.
 * Extra sheets/quotes are added from the project and the builders, not here.
 *   - Exactly one green primary, the next step: no sheet → Create cost plan;
 *     sheet but no quote → Create quote; both → Open quote.
 * Creating a quote never blocks on a missing sheet — it just can't show a
 * margin yet.
 */
function EstimateCard({
  opportunity,
  projectId,
  sheets,
  quotes,
  categoryNames,
  openingCostPlan,
  creatingQuote,
  onCostPlan,
  onQuote,
}: {
  opportunity: Opportunity;
  projectId: string | null;
  sheets: MaterialsSheet[];
  quotes: Quote[];
  /** Selected job types (Details card's Project types field), offered as a
   * starting structure — see the "start with a section per type" boxes. */
  categoryNames: string[];
  openingCostPlan: boolean;
  creatingQuote: boolean;
  /** Open the existing sheet, or create the first one. */
  onCostPlan: () => void;
  /** Open the headline quote, or create the first one (optionally with a
   * section per project type). */
  onQuote: (withSectionPerType: boolean) => void;
}) {
  const hasSheet = sheets.length > 0;
  const hasQuote = quotes.length > 0;
  // Starting structure for the first quote — once one exists, later ones
  // are almost always a revision or a second option.
  const [preAddSections, setPreAddSections] = useState(true);
  const offerPreAdd = categoryNames.length > 0 && !hasQuote;
  // The single primary: the next step.
  const primary: "cost_plan" | "quote" = !hasSheet ? "cost_plan" : "quote";

  return (
    <section className="card-surface space-y-3 p-5">
      <h3 className="text-base font-bold text-foreground">Estimate</h3>

      {!hasSheet && !hasQuote ? (
        <p className="text-sm text-muted-foreground">No cost plan or quote yet.</p>
      ) : (
        <div className="space-y-2">
          {sheets.map((sheet) => (
            <Link
              key={sheet.id}
              to={`/projects/${projectId}/materials`}
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
                {quote.kind === "addon" && (
                  <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-bold text-info">
                    Add-on #{addonQuoteNumbers(quotes).get(quote.id)}
                  </span>
                )}
              </div>
              <span className={quoteStatusMeta(quote.status).badge}>{quoteStatusMeta(quote.status).label}</span>
            </Link>
          ))}
        </div>
      )}

      {hasQuote && !hasSheet && <p className="text-xs text-muted-subtle">No cost plan — margin won't be visible.</p>}

      <div className="flex flex-col gap-2 pt-1">
        <Button
          size="sm"
          variant={primary === "cost_plan" ? "default" : "outline"}
          className={cn(primary === "cost_plan" && "font-bold")}
          disabled={openingCostPlan}
          onClick={onCostPlan}
        >
          <Calculator className="mr-2 h-3.5 w-3.5" />
          {openingCostPlan ? "Opening…" : hasSheet ? "Open cost plan" : "Create cost plan"}
        </Button>

        <Button
          size="sm"
          variant={primary === "quote" ? "default" : "outline"}
          className={cn("mt-1", primary === "quote" && "font-bold")}
          disabled={creatingQuote}
          onClick={() => onQuote(offerPreAdd && preAddSections)}
        >
          <FileText className="mr-2 h-3.5 w-3.5" />
          {creatingQuote ? "Creating…" : hasQuote ? "Open quote" : "Create quote"}
        </Button>
        {/* Each option sits under the button it applies to. */}
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
      </div>

      {opportunity.stage === "won" && !quotes.some((q) => q.status === "approved") && (
        <p className="text-xs font-semibold text-warning-strong">Won manually — no signed quote on file.</p>
      )}
    </section>
  );
}

/** Which estimate documents this opportunity's project has — the single
 * check behind the Estimate card's buttons, the stage banner's cost plan
 * action and the Appointments card's "Start estimate" (same query keys as
 * the project pages, so they share cache and refresh together). */
function useEstimateDocs(projectId: string | null) {
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
  return { sheets, quotes };
}

/** A sheet's own cost total — fetched per-row since EstimateCard only
 * lists sheets, not their sections/items. */
function SheetCostBadge({ sheetId }: { sheetId: string }) {
  const { data: sections = [] } = useQuery({
    queryKey: ["materials-sections", { sheet: sheetId }],
    queryFn: () => listMaterialsBySheet(sheetId),
  });
  const cost = costPlanTotal(sections);
  return <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(cost)}</span>;
}

function OpportunityAppointmentsCard({
  opportunityId,
  clientId,
  open,
  onOpenChange,
  estimateAction,
}: {
  opportunityId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateAction: { label: string; onClick: () => void; pending?: boolean };
}) {
  const { data: appointments = [] } = useQuery({
    queryKey: ["opportunity-appointments", opportunityId],
    queryFn: () => listAppointmentsForOpportunity(opportunityId),
  });

  // Completed appointments stay on the card (with their Completed badge),
  // below the scheduled ones — completing one never makes it vanish.
  // Cancelled / no-show ones are still left off.
  const shown = [
    ...appointments.filter((a) => a.status === "scheduled"),
    ...appointments.filter((a) => a.status === "completed"),
  ];

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Appointments</h3>
        <button type="button" onClick={() => onOpenChange(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {shown.map((a) => (
            <AppointmentRow key={a.id} appointment={a} estimateAction={estimateAction} />
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

// Newest first — the card shows this many until "See more" is clicked.
const ACTIVITY_PREVIEW_COUNT = 3;

// Guidance on the Measurements card — measurements come from the site
// visit, so they're usually blank before it.
const MEASUREMENTS_HINT = "Fill this out once the site visit is completed.";

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
  const [showAll, setShowAll] = useState(false);

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
        <>
          <ul className="mt-4 space-y-3">
            {(showAll ? activities : activities.slice(0, ACTIVITY_PREVIEW_COUNT)).map((a) => (
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
          {activities.length > ACTIVITY_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-sm font-semibold text-primary hover:underline"
            >
              {showAll ? "See less" : `See more (${activities.length - ACTIVITY_PREVIEW_COUNT})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

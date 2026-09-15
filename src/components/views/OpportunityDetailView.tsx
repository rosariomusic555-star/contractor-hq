import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { OPPORTUNITY_STAGES, opportunityStageMeta } from "@/lib/statusMeta";
import {
  getOpportunity,
  updateOpportunity,
  moveOpportunityStage,
  listOpportunityPhotos,
  addOpportunityPhoto,
  deleteOpportunityPhoto,
  getSignedImageUrls,
  listActivitiesForOpportunity,
  logActivity,
  listTasksForOpportunity,
  setTaskCompleted,
  listAppointmentsForOpportunity,
  type Opportunity,
  type OpportunityStage,
  type OpportunityPriority,
  type ActivityKind,
} from "@/lib/api";
import { TaskRow, CreateTaskDialog } from "@/components/views/TasksView";
import { AppointmentRow, CreateAppointmentDialog } from "@/components/views/AppointmentsView";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

const ACTIVITY_KIND_LABEL: Partial<Record<ActivityKind, string>> = {
  note: "Note",
  call: "Call",
  text: "Text",
  email: "Email",
  stage_changed: "Stage change",
  other: "Other",
};

export function OpportunityDetailView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: opportunity, isLoading, isError, error } = useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => getOpportunity(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["opportunity", id] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateOpportunity>[1]) => updateOpportunity(id, patch),
    onSuccess: invalidate,
    onError,
  });
  const moveStageMut = useMutation({
    mutationFn: (toStage: OpportunityStage) => moveOpportunityStage(opportunity!, toStage),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-activities", id] });
    },
    onError,
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const field = (key: keyof Opportunity, value: string | number | null) =>
    draft[key] ?? (value == null ? "" : String(value));
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const commitField = (key: keyof Opportunity, current: string | number | null) => {
    const value = draft[key];
    if (value === undefined) return;
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    if (value === (current == null ? "" : String(current))) return;
    const isNumeric = key === "estimated_value" || key === "probability";
    updateMut.mutate({ [key]: value.trim() === "" ? null : isNumeric ? Number(value) : value.trim() });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (isError || !opportunity)
    return <p className="text-destructive">Failed to load opportunity: {(error as Error)?.message}</p>;

  const meta = opportunityStageMeta(opportunity.stage);

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
          <p className="mt-1 text-sm text-muted-foreground">
            {opportunity.client?.name ?? "No client"}
            {opportunity.project_type ? ` · ${opportunity.project_type}` : ""}
          </p>
        </div>
        <Select value={opportunity.stage} onValueChange={(v) => moveStageMut.mutate(v as OpportunityStage)}>
          <SelectTrigger className={`w-56 ${meta.badge}`}>
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
                <div className={FIELD_LABEL}>Project type</div>
                <Input
                  value={field("project_type", opportunity.project_type)}
                  onChange={(e) => setField("project_type", e.target.value)}
                  onBlur={() => commitField("project_type", opportunity.project_type)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Estimated value</div>
                <Input
                  type="number"
                  value={field("estimated_value", opportunity.estimated_value)}
                  onChange={(e) => setField("estimated_value", e.target.value)}
                  onBlur={() => commitField("estimated_value", opportunity.estimated_value)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Probability (%)</div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={field("probability", opportunity.probability)}
                  onChange={(e) => setField("probability", e.target.value)}
                  onBlur={() => commitField("probability", opportunity.probability)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Expected close date</div>
                <Input
                  type="date"
                  value={field("expected_close_date", opportunity.expected_close_date)}
                  onChange={(e) => setField("expected_close_date", e.target.value)}
                  onBlur={() => commitField("expected_close_date", opportunity.expected_close_date)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Lead source</div>
                <Input
                  value={field("lead_source", opportunity.lead_source)}
                  onChange={(e) => setField("lead_source", e.target.value)}
                  onBlur={() => commitField("lead_source", opportunity.lead_source)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Assigned to</div>
                <Input
                  value={field("assigned_to", opportunity.assigned_to)}
                  onChange={(e) => setField("assigned_to", e.target.value)}
                  onBlur={() => commitField("assigned_to", opportunity.assigned_to)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Priority</div>
                <Select
                  value={opportunity.priority}
                  onValueChange={(v) => updateMut.mutate({ priority: v as OpportunityPriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <div className="space-y-1">
              <div className={FIELD_LABEL}>Measurements</div>
              <Textarea
                value={field("measurements", opportunity.measurements)}
                onChange={(e) => setField("measurements", e.target.value)}
                onBlur={() => commitField("measurements", opportunity.measurements)}
                rows={2}
              />
            </div>
          </section>

          <section className="card-surface space-y-4 p-5">
            <h3 className="text-base font-bold text-foreground">Next action</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Next action</div>
                <Input
                  value={field("next_action", opportunity.next_action)}
                  onChange={(e) => setField("next_action", e.target.value)}
                  onBlur={() => commitField("next_action", opportunity.next_action)}
                  placeholder="e.g. Send follow-up call"
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Next action date</div>
                <Input
                  type="date"
                  value={field("next_action_date", opportunity.next_action_date)}
                  onChange={(e) => setField("next_action_date", e.target.value)}
                  onBlur={() => commitField("next_action_date", opportunity.next_action_date)}
                />
              </div>
              <div className="space-y-1">
                <div className={FIELD_LABEL}>Last contact date</div>
                <Input
                  type="date"
                  value={field("last_contact_date", opportunity.last_contact_date)}
                  onChange={(e) => setField("last_contact_date", e.target.value)}
                  onBlur={() => commitField("last_contact_date", opportunity.last_contact_date)}
                />
              </div>
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

          <OpportunityPhotosCard opportunityId={id} />
        </div>

        <div className="space-y-5">
          <OpportunityAppointmentsCard opportunityId={id} clientId={opportunity.client_id} />
          <OpportunityTasksCard opportunityId={id} clientId={opportunity.client_id} />
          <OpportunityActivityCard opportunityId={id} clientId={opportunity.client_id} />
        </div>
      </div>
    </div>
  );
}

function OpportunityAppointmentsCard({ opportunityId, clientId }: { opportunityId: string; clientId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: appointments = [] } = useQuery({
    queryKey: ["opportunity-appointments", opportunityId],
    queryFn: () => listAppointmentsForOpportunity(opportunityId),
  });

  const upcoming = appointments.filter((a) => a.status === "scheduled");

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Appointments</h3>
        <button type="button" onClick={() => setAddOpen(true)} className="text-xs font-bold text-primary hover:underline">
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
      <CreateAppointmentDialog open={addOpen} onOpenChange={setAddOpen} defaultClientId={clientId} defaultOpportunityId={opportunityId} />
    </section>
  );
}

function OpportunityTasksCard({ opportunityId, clientId }: { opportunityId: string; clientId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);

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

  const open = tasks.filter((t) => !t.completed);

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Tasks</h3>
        <button type="button" onClick={() => setAddOpen(true)} className="text-xs font-bold text-primary hover:underline">
          + Add
        </button>
      </div>
      {open.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={(v) => completeMut.mutate({ id: t.id, completed: v })} />
          ))}
        </div>
      )}
      <CreateTaskDialog open={addOpen} onOpenChange={setAddOpen} defaultClientId={clientId} defaultOpportunityId={opportunityId} />
    </section>
  );
}

function OpportunityPhotosCard({ opportunityId }: { opportunityId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: photos = [] } = useQuery({
    queryKey: ["opportunity-photos", opportunityId],
    queryFn: () => listOpportunityPhotos(opportunityId),
  });
  const paths = photos.map((p) => p.storage_path);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["opportunity-photo-urls", opportunityId, photos.map((p) => p.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["opportunity-photos", opportunityId] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (let i = 0; i < files.length; i++) {
        await addOpportunityPhoto(opportunityId, files[i], { sort_order: photos.length + i });
      }
    },
    onSuccess: invalidate,
    onError,
  });
  const deleteMut = useMutation({ mutationFn: deleteOpportunityPhoto, onSuccess: invalidate, onError });

  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">Site photos</h3>
        {photos.length > 0 && <span className="text-[13px] font-semibold text-muted-foreground">{pluralize(photos.length, "photo")}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
            {signedUrls[p.storage_path] ? (
              <img src={signedUrls[p.storage_path]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
            <button
              type="button"
              onClick={() => deleteMut.mutate(p)}
              aria-label="Delete photo"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add photos"
        >
          {uploadMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) uploadMut.mutate(files);
          }}
        />
      </div>
    </section>
  );
}

function OpportunityActivityCard({ opportunityId, clientId }: { opportunityId: string; clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");

  const { data: activities = [] } = useQuery({
    queryKey: ["opportunity-activities", opportunityId],
    queryFn: () => listActivitiesForOpportunity(opportunityId),
  });

  const logMut = useMutation({
    mutationFn: () => logActivity(clientId, kind, body.trim(), { opportunity_id: opportunityId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity-activities", opportunityId] });
      setBody("");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <section className="card-surface p-5">
      <h3 className="text-base font-bold text-foreground">Activity</h3>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
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

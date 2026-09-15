import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { OPPORTUNITY_STAGES, opportunityStageMeta } from "@/lib/statusMeta";
import {
  listOpportunities,
  createOpportunity,
  moveOpportunityStage,
  listClients,
  type Opportunity,
  type OpportunityStage,
} from "@/lib/api";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The sales pipeline — a Kanban board on desktop (drag between the 11
 * default stages, see statusMeta.ts's OPPORTUNITY_STAGES), a stage-
 * grouped list with a "Move" picker on mobile (drag-and-drop doesn't
 * work well on touch for this many columns). Every stage change goes
 * through moveOpportunityStage() so it's recorded in the activity
 * timeline, never a silent overwrite.
 */
export function PipelineView() {
  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ["opportunities"],
    queryFn: listOpportunities,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const moveMut = useMutation({
    mutationFn: ({ opp, toStage }: { opp: Opportunity; toStage: OpportunityStage }) =>
      moveOpportunityStage(opp, toStage),
    onMutate: async ({ opp, toStage }) => {
      await qc.cancelQueries({ queryKey: ["opportunities"] });
      const previous = qc.getQueryData<Opportunity[]>(["opportunities"]);
      qc.setQueryData<Opportunity[]>(["opportunities"], (old) =>
        old?.map((o) => (o.id === opp.id ? { ...o, stage: toStage } : o)),
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) qc.setQueryData(["opportunities"], context.previous);
      toast({ title: err.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["opportunities"] }),
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const toStage = result.destination.droppableId as OpportunityStage;
    const opp = opportunities.find((o) => o.id === result.draggableId);
    if (!opp || opp.stage === toStage) return;
    moveMut.mutate({ opp, toStage });
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Pipeline</h1>
          <p className="mt-0.5 text-muted-foreground">{pluralize(opportunities.length, "opportunity", "opportunities")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="font-bold">
          + New opportunity
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {/* Desktop: drag-and-drop board */}
      <div className="hidden overflow-x-auto pb-4 lg:block">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3" style={{ minWidth: OPPORTUNITY_STAGES.length * 272 }}>
            {OPPORTUNITY_STAGES.map((stage) => (
              <PipelineColumn key={stage} stage={stage} opportunities={opportunities.filter((o) => o.stage === stage)} />
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Mobile: stage-grouped list, no drag — a Select per card instead */}
      <div className="space-y-5 lg:hidden">
        {OPPORTUNITY_STAGES.map((stage) => {
          const items = opportunities.filter((o) => o.stage === stage);
          if (items.length === 0) return null;
          const meta = opportunityStageMeta(stage);
          return (
            <div key={stage}>
              <div className="mb-2 flex items-center gap-2">
                <span className={meta.badge}>{meta.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <OpportunityCard key={o.id} opportunity={o} />
                ))}
              </div>
            </div>
          );
        })}
        {!isLoading && opportunities.length === 0 && (
          <div className="card-surface p-10 text-center text-muted-foreground">No opportunities yet.</div>
        )}
      </div>

      <CreateOpportunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function PipelineColumn({ stage, opportunities }: { stage: OpportunityStage; opportunities: Opportunity[] }) {
  const meta = opportunityStageMeta(stage);
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-card bg-muted/40 p-2.5">
      <div className="flex items-center justify-between px-1.5 pb-2">
        <span className="text-xs font-bold text-foreground">{meta.label}</span>
        <span className="text-xs font-semibold text-muted-foreground">{opportunities.length}</span>
      </div>
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn("min-h-[60px] flex-1 space-y-2 rounded-lg p-1", snapshot.isDraggingOver && "bg-primary/5")}
          >
            {opportunities.map((o, index) => (
              <Draggable key={o.id} draggableId={o.id} index={index}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                    <OpportunityCard opportunity={o} dragging={snapshot.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function OpportunityCard({ opportunity, dragging }: { opportunity: Opportunity; dragging?: boolean }) {
  const overdue = !!opportunity.next_action_date && opportunity.next_action_date < today();
  return (
    <Link
      to={`/pipeline/${opportunity.id}`}
      className={cn("block card-surface p-3 text-left transition-shadow", dragging && "shadow-card-hover")}
    >
      <div className="truncate text-sm font-bold text-foreground">{opportunity.client?.name ?? "No client"}</div>
      <div className="truncate text-xs text-muted-foreground">{opportunity.title}</div>
      {opportunity.address && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-subtle">
          <MapPin className="h-3 w-3 shrink-0" />
          {opportunity.address}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {opportunity.estimated_value != null ? (
          <span className="text-sm font-extrabold tabular-nums text-foreground">
            {formatCurrency(opportunity.estimated_value)}
          </span>
        ) : (
          <span />
        )}
        {opportunity.lead_source && (
          <span className="truncate text-[10px] font-semibold text-muted-subtle">{opportunity.lead_source}</span>
        )}
      </div>
      {(opportunity.next_action || opportunity.next_action_date) && (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1 rounded px-1.5 py-1 text-[11px]",
            overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          {overdue && <AlertTriangle className="h-3 w-3 shrink-0" />}
          <span className="truncate">
            {opportunity.next_action ?? "Follow up"}
            {opportunity.next_action_date ? ` · ${opportunity.next_action_date}` : ""}
          </span>
        </div>
      )}
      <div className="mt-1 text-[10px] text-muted-subtle">Updated {timeAgo(opportunity.updated_at)}</div>
    </Link>
  );
}

function CreateOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectType, setProjectType] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [leadSource, setLeadSource] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    if (!open) {
      setClientId(null);
      setTitle("");
      setProjectType("");
      setEstimatedValue("");
      setLeadSource("");
    }
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      createOpportunity({
        client_id: clientId!,
        title: title.trim(),
        project_type: projectType.trim() || null,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        lead_source: leadSource.trim() || null,
      }),
    onSuccess: (opp) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onOpenChange(false);
      navigate(`/pipeline/${opp.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>New opportunity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <button
                type="button"
                onClick={() => setClientPickerOpen(true)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50"
              >
                <span className={selectedClient ? "text-foreground" : "text-muted-foreground"}>
                  {selectedClient ? selectedClient.name : "Pick a client"}
                </span>
                <span className="text-xs font-semibold text-primary">Change</span>
              </button>
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Backyard patio)" />
            <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="Project type (optional)" />
            <Input
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="Estimated value (optional)"
              type="number"
            />
            <Input value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Lead source (optional)" />
          </div>
          <Button
            className="w-full font-bold"
            disabled={!clientId || !title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Creating…" : "Create opportunity"}
          </Button>
        </DialogContent>
      </Dialog>
      <ClientPickerDialog open={clientPickerOpen} onOpenChange={setClientPickerOpen} onSelect={setClientId} />
    </>
  );
}

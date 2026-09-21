import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { useToast } from "@/hooks/use-toast";
import { listClients, createProject, updateQuote, logProjectEvent, getOpportunity, updateOpportunity, moveOpportunityStage } from "@/lib/api";

/** Dedicated "New project" screen (/projects/new) — replaces the old modal.
 * Project name + client (pick existing, or create one inline via the
 * shared ClientPickerDialog — see src/components/common/ClientPicker.tsx).
 *
 * Reachable from a standalone quote's "Create project" nudge (Estimated
 * Cost card), which navigates here with `state: { linkQuoteId }`. In that
 * case, creating the project also re-parents that exact quote onto it
 * (quotes.project_id) instead of leaving it behind as an orphaned
 * standalone quote — landing the user back on the quote, now
 * project-linked, rather than on the new project's own page.
 *
 * Also reachable from an approved opportunity's quote (CRM Phase 5) with
 * `state: { linkQuoteId, linkOpportunityId }` — pre-fills name/client from
 * the opportunity (no retyping) and, on create, links its project_id.
 * Signing the quote already moved the opportunity to Won automatically
 * (migration 0072), so moveOpportunityStage here is just a safety net for
 * the (now rare) case it isn't already — same combined update+log helper
 * the pipeline itself uses, so it's never a silent stage change. */
export function NewProjectView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const state = location.state as { linkQuoteId?: string; linkOpportunityId?: string } | null;
  const linkQuoteId = state?.linkQuoteId ?? null;
  const linkOpportunityId = state?.linkOpportunityId ?? null;

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const { data: linkedOpportunity } = useQuery({
    queryKey: ["opportunity", linkOpportunityId],
    queryFn: () => getOpportunity(linkOpportunityId!),
    enabled: !!linkOpportunityId,
  });

  useEffect(() => {
    if (linkedOpportunity) {
      setName(linkedOpportunity.title);
      setClientId(linkedOpportunity.client_id);
    }
  }, [linkedOpportunity]);

  const canSave = name.trim().length > 0;

  const createMut = useMutation({
    mutationFn: async () => {
      const project = await createProject({ name: name.trim(), client_id: clientId, status: "draft" });
      if (linkQuoteId) await updateQuote(linkQuoteId, { project_id: project.id });
      if (linkedOpportunity) {
        await updateOpportunity(linkedOpportunity.id, { project_id: project.id });
        if (linkedOpportunity.stage !== "won") await moveOpportunityStage(linkedOpportunity, "won");
      }
      return project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      void logProjectEvent(project.id, "project_created", "Project created");
      if (linkedOpportunity) {
        qc.invalidateQueries({ queryKey: ["opportunity", linkedOpportunity.id] });
        qc.invalidateQueries({ queryKey: ["opportunities"] });
      }
      if (linkQuoteId) {
        qc.invalidateQueries({ queryKey: ["quote", linkQuoteId] });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast({ title: linkedOpportunity ? "Opportunity won — quote moved into new project" : "Quote moved into new project" });
        navigate(`/quotes/${linkQuoteId}`);
      } else {
        navigate(`/projects/${project.id}`);
      }
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create project", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <Link
        to={linkQuoteId ? `/quotes/${linkQuoteId}` : "/projects"}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {linkQuoteId ? "Back to quote" : "Projects"}
      </Link>

      <h1 className="text-[28px] font-bold tracking-tight text-foreground">New project</h1>
      {linkedOpportunity && (
        <p className="text-sm text-muted-foreground">
          Converting the won opportunity <span className="font-semibold text-foreground">{linkedOpportunity.title}</span> — customer and quote carry over automatically.
        </p>
      )}

      <div className="card-surface space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="E.g., Smith Backyard Patio"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>Client</Label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50"
          >
            <span className={selectedClient ? "text-foreground" : "text-muted-foreground"}>
              {selectedClient ? selectedClient.name : "No client"}
            </span>
            <span className="text-xs font-semibold text-primary">Change</span>
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(linkQuoteId ? `/quotes/${linkQuoteId}` : "/projects")}
        >
          Cancel
        </Button>
        <Button
          onClick={() => createMut.mutate()}
          disabled={!canSave || createMut.isPending}
          className="font-bold"
        >
          {createMut.isPending ? "Creating…" : "Create project"}
        </Button>
      </div>

      <ClientPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setClientId} allowClear />
    </div>
  );
}

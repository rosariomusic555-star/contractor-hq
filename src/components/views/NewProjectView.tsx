import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientCombobox } from "@/components/common/ClientPicker";
import { useClientField } from "@/hooks/use-client-field";
import { useToast } from "@/hooks/use-toast";
import { createProject, updateQuote, logProjectEvent } from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

/** Dedicated "New project" screen (/projects/new) — the walk-in / repeat-
 * client path: a project with no opportunity behind it at all. Project
 * name + client (pick existing, or add one inline via the shared
 * ClientCombobox — see src/components/common/ClientPicker.tsx; a new client
 * is created by "Create project", right before the project).
 *
 * Reachable from a standalone quote's "Create project" nudge (Estimated
 * Cost card), which navigates here with `state: { linkQuoteId }`. In that
 * case, creating the project also re-parents that exact quote onto it
 * (quotes.project_id) instead of leaving it behind as an orphaned
 * standalone quote — landing the user back on the quote, now
 * project-linked, rather than on the new project's own page.
 *
 * NOT reachable from an opportunity anymore — that path is
 * getOrCreateOpportunityProject() (lazy, on the first photo/sheet/quote)
 * and markOpportunityWon() (on Won), both automatic. There is exactly one
 * way a project is created from an opportunity now, and this isn't it. */
export function NewProjectView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const state = location.state as { linkQuoteId?: string } | null;
  const linkQuoteId = state?.linkQuoteId ?? null;

  const [name, setName] = useState("");
  const client = useClientField();

  // Client is optional here, but a half-filled new-client draft isn't.
  const canSave = name.trim().length > 0 && (!client.draft || client.hasClient);

  const createMut = useMutation({
    mutationFn: async () => {
      const clientId = await client.ensureClient();
      if (clientId === undefined) return null;
      const project = await createProject({ name: name.trim(), client_id: clientId, status: "estimating" });
      if (linkQuoteId) await updateQuote(linkQuoteId, { project_id: project.id });
      return project;
    },
    onSuccess: (project) => {
      if (!project) return;
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      void logProjectEvent(project.id, "project_created", "Project created");
      if (linkQuoteId) {
        qc.invalidateQueries({ queryKey: ["quote", linkQuoteId] });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast({ title: "Quote moved into new project" });
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
      <BackLink
        to={linkQuoteId ? `/quotes/${linkQuoteId}` : "/projects"}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >{linkQuoteId ? "Back to quote" : "Projects"}</BackLink>

      <h1 className="text-[28px] font-bold tracking-tight text-foreground">New project</h1>

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

        <ClientCombobox
          field={client}
          optional
          onCreateAnyway={() => {
            client.acceptDuplicate();
            createMut.mutate();
          }}
        />
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

    </div>
  );
}

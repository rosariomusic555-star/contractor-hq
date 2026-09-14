import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { listClients, createClient, createProject, updateQuote, logProjectEvent } from "@/lib/api";

const NO_CLIENT = "__none__";
const NEW_CLIENT = "__new__";

/** Dedicated "New project" screen (/projects/new) — replaces the old modal.
 * Project name + client (pick existing, or create one inline).
 *
 * Reachable from a standalone quote's "Create project" nudge (Estimated
 * Cost card), which navigates here with `state: { linkQuoteId }`. In that
 * case, creating the project also re-parents that exact quote onto it
 * (quotes.project_id) instead of leaving it behind as an orphaned
 * standalone quote — landing the user back on the quote, now
 * project-linked, rather than on the new project's own page. */
export function NewProjectView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const linkQuoteId = (location.state as { linkQuoteId?: string } | null)?.linkQuoteId ?? null;

  const [name, setName] = useState("");
  const [clientChoice, setClientChoice] = useState<string>(NO_CLIENT);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const creatingNew = clientChoice === NEW_CLIENT;
  const canSave = name.trim().length > 0 && (!creatingNew || newName.trim().length > 0);

  const createMut = useMutation({
    mutationFn: async () => {
      let clientId: string | null =
        creatingNew || clientChoice === NO_CLIENT ? null : clientChoice;
      if (creatingNew) {
        const client = await createClient({
          name: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim(),
        });
        clientId = client.id;
      }
      const project = await createProject({ name: name.trim(), client_id: clientId, status: "draft" });
      if (linkQuoteId) await updateQuote(linkQuoteId, { project_id: project.id });
      return project;
    },
    onSuccess: (project) => {
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
      <Link
        to={linkQuoteId ? `/quotes/${linkQuoteId}` : "/projects"}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {linkQuoteId ? "Back to quote" : "Projects"}
      </Link>

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

        <div className="space-y-2">
          <Label htmlFor="project-client">Client</Label>
          <Select value={clientChoice} onValueChange={setClientChoice}>
            <SelectTrigger id="project-client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_CLIENT}>+ Create new client</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {creatingNew && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="new-client-name">Client name</Label>
              <Input
                id="new-client-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-email">Email</Label>
              <Input
                id="new-client-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="client@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-phone">Phone</Label>
              <Input
                id="new-client-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-address">
                Address <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="new-client-address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="123 Oak Street, Springfield"
              />
            </div>
          </div>
        )}
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

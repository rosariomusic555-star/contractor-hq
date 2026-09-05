import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { listClients, listProjects, createQuote } from "@/lib/api";

const NONE = "__none__";

/** Standalone quote creation (/quotes/new) — sets up the quote's basics
 * (client, optional project link, deposit/notes/terms) and hands off to the
 * quote builder (QuoteWorkspace, via /quotes/:quoteId) to add line items. */
export function QuoteNewView() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [clientId, setClientId] = useState(NONE);
  const [projectId, setProjectId] = useState(NONE);
  const [deposit, setDeposit] = useState("25");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createMut = useMutation({
    mutationFn: () =>
      createQuote({
        client_id: clientId === NONE ? null : clientId,
        project_id: projectId === NONE ? null : projectId,
        deposit_percentage: parseFloat(deposit) || 0,
        notes: notes || null,
        terms: terms || null,
      }),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <Link
        to="/quotes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to quotes
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">New quote</h1>
        <p className="text-muted-foreground mt-1">
          Set up the basics — you'll add sections and line items next.
        </p>
      </div>

      <div className="stat-card space-y-5">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="No client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Link to project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="No project" />
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
          <p className="text-xs text-muted-foreground">
            Optional. Linking a project unlocks the materials cost/margin panel in the quote
            builder.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quote-deposit">Deposit required</Label>
          <div className="relative w-32">
            <Input
              id="quote-deposit"
              type="number"
              min="0"
              max="100"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="pr-7"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              %
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quote-notes">Notes</Label>
          <Textarea
            id="quote-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for the client about this job..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quote-terms">Terms &amp; conditions</Label>
          <Textarea
            id="quote-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Payment terms, warranty info, etc."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          {createMut.isPending ? "Creating…" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}

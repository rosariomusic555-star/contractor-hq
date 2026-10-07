import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FolderOpen, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveModal } from "@/components/common/ResponsiveModal";
import { ClientCombobox } from "@/components/common/ClientPicker";
import { ChoiceMark } from "@/components/common/ChoiceMark";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";
import { useClientField } from "@/hooks/use-client-field";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PROJECT_ACTION_LABEL, suggestedProjectName, type ProjectAction } from "@/lib/standaloneQuote";

type Mode = "new" | "existing";
import {
  createProjectFromQuote,
  listStandaloneQuoteTargets,
  type Quote,
  type StandaloneQuoteConversion,
} from "@/lib/api";

/**
 * The "Create project" modal for a standalone quote (0166) — the one flow,
 * wherever it opens: right after Mark approved, the approved-not-in-a-
 * project banner, Needs you / the client-signed notification
 * (?convert=1), a project-only action, and the older "Create project"
 * nudge. New project (name, client, site address — all prefilled), or an
 * existing project of the client's without a signed quote; the client's
 * open opportunity can be linked (marked Won) instead of left behind.
 * Bottom sheet on phones, so the normal case is one tap.
 */
function CreateProjectFromQuoteDialogInner({
  open,
  onOpenChange,
  quote,
  then,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Pick<Quote, "id" | "status" | "client_id" | "deposit_percentage"> & { quote_sections?: { name: string }[] };
  /** The project-only action that opened it — done right after. */
  then?: ProjectAction | null;
  /** Called after converting; return true when the caller carries on
   * (navigates) itself, so the success step isn't shown. */
  onConverted: (result: StandaloneQuoteConversion) => boolean | void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const client = useClientField(quote.client_id);
  const clientName = client.selectedClient?.name ?? null;
  const approved = quote.status === "approved";

  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [done, setDone] = useState<StandaloneQuoteConversion | null>(null);

  const clientId = client.selectedClient?.id ?? null;
  const { data: targets } = useQuery({
    queryKey: ["standalone-quote-targets", clientId],
    queryFn: () => listStandaloneQuoteTargets(clientId!),
    enabled: open && !!clientId,
  });
  const opportunities = targets?.opportunities ?? [];
  const projects = targets?.projects ?? [];
  const opportunity = opportunities.find((o) => o.id === opportunityId) ?? null;
  const oppProject = opportunity?.project_id ? opportunity.project_id : null;

  // Prefill once per opening (and when the client changes): name from the
  // client + the quote's work, address from the client, the one open
  // opportunity pre-ticked.
  const sectionNames = useMemo(() => (quote.quote_sections ?? []).map((s) => s.name), [quote.quote_sections]);
  useEffect(() => {
    if (!open) return;
    setName(suggestedProjectName(clientName, sectionNames));
    setAddress(client.selectedClient?.address ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);
  useEffect(() => {
    if (!open) return;
    setOpportunityId(opportunities.length === 1 ? opportunities[0].id : null);
    setExistingId(null);
    setMode("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targets]);
  useEffect(() => {
    if (open) setDone(null);
  }, [open]);

  const convert = useMutation({
    mutationFn: async () => {
      if (mode === "existing") {
        return createProjectFromQuote({ quoteId: quote.id, projectId: existingId, name, clientId, address: null });
      }
      const id = await client.ensureClient();
      if (id === undefined) return null;
      return createProjectFromQuote({
        quoteId: quote.id,
        opportunity: opportunity ? { id: opportunity.id, project_id: opportunity.project_id } : null,
        name,
        clientId: id,
        address,
      });
    },
    onSuccess: (result) => {
      if (!result) return;
      for (const key of ["quotes", "quote", "projects", "project", "opportunities", "invoices", "project-features", "materials", "notifications"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: approved ? "Project created — the job is Won" : "Quote moved into the project" });
      const handled = onConverted(result);
      if (handled) onOpenChange(false);
      else setDone(result);
    },
    onError: (err: Error) => toast({ title: "Couldn't create the project", description: err.message, variant: "destructive" }),
  });

  const canSubmit =
    !convert.isPending &&
    (mode === "existing" ? !!existingId : !!oppProject || (name.trim().length > 0 && (!client.draft || client.hasClient)));

  const title = done ? "Project ready" : approved ? "Quote approved" : "Create a project";
  const description = done
    ? undefined
    : approved
      ? "Create the project to invoice, schedule, and track this job."
      : "Move this quote into a project to add a cost plan, invoice and schedule it.";

  if (done) {
    const base = `/projects/${done.project_id}`;
    return (
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
        <div className="flex items-start gap-3 rounded-xl bg-success/10 p-3.5 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p>
            {done.won ? "The project is Won and scheduled-ready." : "The quote is in the project now."}
            {done.deposit_invoice_id ? " Its deposit invoice is drafted." : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button variant={done.deposit_invoice_id ? "outline" : "default"} onClick={() => navigate(base)} className="font-semibold">
            Go to project
          </Button>
          {done.deposit_invoice_id && (
            <Button onClick={() => navigate(`${base}/invoices/${done.deposit_invoice_id}`)} className="font-bold">
              <Send className="mr-1.5 h-4 w-4" />
              Send deposit invoice
            </Button>
          )}
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        {projects.length > 0 && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where it goes">
            {(
              [
                ["new", "New project", Plus],
                ["existing", "Existing project", FolderOpen],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  mode === m ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "existing" ? (
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={existingId ?? ""} onValueChange={setExistingId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick one of this client's projects" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Only this client's projects without a signed quote.</p>
          </div>
        ) : (
          <>
            {opportunities.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {clientName ?? "This client"} has an open opportunity — link it instead of leaving a duplicate:
                </p>
                {[...opportunities.map((o) => ({ id: o.id as string | null, label: `${o.title} — mark it Won` })), { id: null, label: "Don't link an opportunity" }].map(
                  (o) => (
                    <button
                      key={o.id ?? "none"}
                      type="button"
                      role="radio"
                      aria-checked={opportunityId === o.id}
                      onClick={() => setOpportunityId(o.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <ChoiceMark multi={false} checked={opportunityId === o.id} />
                      <span className="min-w-0 flex-1">{o.label}</span>
                    </button>
                  ),
                )}
              </div>
            )}
            {oppProject ? (
              <p className="rounded-xl bg-muted px-3.5 py-3 text-sm text-muted-foreground">
                The quote goes into that opportunity's project, which becomes Won.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cpq-name">Project name</Label>
                  <Input id="cpq-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
                </div>
                <ClientCombobox
                  field={client}
                  onCreateAnyway={() => {
                    client.acceptDuplicate();
                    convert.mutate();
                  }}
                />
                <div className="space-y-2">
                  <Label htmlFor="cpq-address">Site address</Label>
                  <Input
                    id="cpq-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city"
                    className="h-11"
                  />
                </div>
              </>
            )}
          </>
        )}

        {then && (
          <p className="text-xs text-muted-foreground">
            Then: <span className="font-semibold text-foreground">{PROJECT_ACTION_LABEL[then]}</span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 sm:h-10">
            Not now
          </Button>
          <Button onClick={() => convert.mutate()} disabled={!canSubmit} className="h-11 font-bold sm:h-10">
            {convert.isPending ? "Creating…" : mode === "existing" || oppProject ? "Add to project" : "Create project"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const CreateProjectFromQuoteDialog = withErrorBoundary(CreateProjectFromQuoteDialogInner, "CreateProjectFromQuoteDialog");

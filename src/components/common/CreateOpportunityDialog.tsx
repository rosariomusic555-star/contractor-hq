import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientCombobox } from "@/components/common/ClientPicker";
import { useClientField } from "@/hooks/use-client-field";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { LeadSourceSelect } from "@/components/common/LeadSourceSelect";
import { useToast } from "@/hooks/use-toast";
import { createOpportunity, setOpportunityCategories } from "@/lib/api";

/**
 * "New opportunity" — the main way work enters the app, so it's a roomy
 * two-column form rather than a tiny modal. Opened from the Dashboard's
 * primary CTA and the Pipeline page. Creates the opportunity and goes
 * straight to its page.
 *
 * Client is the shared ClientCombobox: search existing clients, or add a
 * new one inline. A new client is created by "Create opportunity" itself —
 * client first, then the opportunity linked to it; if the client insert
 * fails, the error shows inline and no opportunity is created.
 *
 * Address is prefilled from the picked (or new) client's address (the job
 * site is usually the client's home) but stays editable. Once the user types
 * in it, changing the client no longer overwrites it.
 *
 * Header and buttons stay put while the body scrolls; below `sm` the dialog
 * is a full-height sheet.
 */
export function CreateOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const client = useClientField();
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [addressEdited, setAddressEdited] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [leadSource, setLeadSource] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      client.reset();
      setTitle("");
      setAddress("");
      setAddressEdited(false);
      setCategoryIds([]);
      setLeadSource(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client picked, or new client's address typed → carry it over, unless
  // the user has already typed their own job-site address. (null = no
  // client at all; leave whatever is there.)
  useEffect(() => {
    if (!addressEdited && client.address !== null) setAddress(client.address);
  }, [client.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMut = useMutation({
    mutationFn: async () => {
      // Existing client → its id; new client → created now (after the
      // duplicate check). undefined = stopped, with the reason shown inline.
      const clientId = await client.ensureClient();
      if (!clientId) return null;
      const opp = await createOpportunity({
        client_id: clientId,
        title: title.trim(),
        address: address.trim() || null,
        lead_source: leadSource,
      });
      if (categoryIds.length > 0) await setOpportunityCategories(opp.id, categoryIds);
      return opp;
    },
    onSuccess: (opp) => {
      if (!opp) return;
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onOpenChange(false);
      navigate(`/pipeline/${opp.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canCreate = client.hasClient && !!title.trim() && !createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Flex column: header + footer fixed, body scrolls. Full-height sheet
        // on phones (dvh, so browser chrome doesn't hide the buttons). From
        // sm up it's pinned near the top instead of centered, so it only
        // grows downward — opening the client list or the new-client section
        // never shifts the fields above it under the cursor.
        className="flex h-[100dvh] max-h-[100dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:top-[6dvh] sm:h-auto sm:max-h-[88dvh] sm:translate-y-0 sm:rounded-card sm:data-[state=closed]:slide-out-to-top-2 sm:data-[state=open]:slide-in-from-top-2"
      >
        <DialogHeader className="shrink-0 border-b border-hairline px-5 pb-4 pt-5 text-left sm:px-8 sm:pt-7">
          <DialogTitle className="text-xl font-bold">New opportunity</DialogTitle>
          <DialogDescription>Log a new lead. You can plan the job, schedule a site visit and quote it from its page.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <ClientCombobox
              field={client}
              className="sm:col-span-2"
              autoFocus
              onCreateAnyway={() => {
                client.acceptDuplicate();
                createMut.mutate();
              }}
            />

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-opp-title">Title</Label>
              <Input
                id="new-opp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Backyard patio"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-opp-address">Job site address</Label>
              <Input
                id="new-opp-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setAddressEdited(true);
                }}
                placeholder="Street, city"
                autoComplete="off"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {client.address && !addressEdited
                  ? "From the client's address. Edit if the job site is somewhere else."
                  : "Where the work happens."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Project types</Label>
              <CategoryMultiSelect value={categoryIds} onChange={setCategoryIds} placeholder="Optional" />
            </div>

            <div className="space-y-1.5">
              <Label>Lead source</Label>
              <LeadSourceSelect value={leadSource} onChange={setLeadSource} placeholder="Optional" />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-hairline px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-8 sm:pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-bold sm:min-w-44" disabled={!canCreate} onClick={() => createMut.mutate()}>
            {createMut.isPending ? "Creating…" : "Create opportunity"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

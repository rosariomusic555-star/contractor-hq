import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { LeadSourceSelect } from "@/components/common/LeadSourceSelect";
import { useToast } from "@/hooks/use-toast";
import { createOpportunity, listClients, setOpportunityCategories } from "@/lib/api";

/**
 * "New opportunity" — the main way work enters the app, so it's a roomy
 * two-column form rather than a tiny modal. Opened from the Dashboard's
 * primary CTA and the Pipeline page. Creates the opportunity and goes
 * straight to its page.
 *
 * Address is prefilled from the picked client's record (the job site is
 * usually the client's home) but stays editable. Once the user types in it,
 * picking a different client no longer overwrites it.
 */
export function CreateOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [addressEdited, setAddressEdited] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [leadSource, setLeadSource] = useState<string | null>(null);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    if (!open) {
      setClientId(null);
      setTitle("");
      setAddress("");
      setAddressEdited(false);
      setCategoryIds([]);
      setLeadSource(null);
    }
  }, [open]);

  // Client picked or changed → carry its address over, unless the user has
  // already typed their own job-site address. Keyed on the resolved client
  // (not just the id) so a client created from the picker fills in too once
  // the clients list refetches.
  const selectedClientAddress = selectedClient?.address ?? null;
  useEffect(() => {
    if (!addressEdited && selectedClient) setAddress(selectedClientAddress ?? "");
  }, [selectedClient?.id, selectedClientAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMut = useMutation({
    mutationFn: async () => {
      const opp = await createOpportunity({
        client_id: clientId!,
        title: title.trim(),
        address: address.trim() || null,
        lead_source: leadSource,
      });
      if (categoryIds.length > 0) await setOpportunityCategories(opp.id, categoryIds);
      return opp;
    },
    onSuccess: (opp) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onOpenChange(false);
      navigate(`/pipeline/${opp.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canCreate = !!clientId && !!title.trim() && !createMut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl gap-6 overflow-y-auto p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New opportunity</DialogTitle>
            <DialogDescription>Log a new lead. You can plan the job, schedule a site visit and quote it from its page.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Client</Label>
              <button
                type="button"
                onClick={() => setClientPickerOpen(true)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50"
              >
                <span className={selectedClient ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {selectedClient ? selectedClient.name : "Pick or add a client"}
                </span>
                <span className="text-xs font-semibold text-primary">{selectedClient ? "Change client" : "Choose client"}</span>
              </button>
            </div>

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
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {selectedClient?.address && !addressEdited
                  ? "From the client's record. Edit if the job site is somewhere else."
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="font-bold sm:min-w-44" disabled={!canCreate} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creating…" : "Create opportunity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ClientPickerDialog open={clientPickerOpen} onOpenChange={setClientPickerOpen} onSelect={setClientId} />
    </>
  );
}

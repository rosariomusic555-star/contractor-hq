import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  getClient,
  createClient,
  updateClient,
  listClients,
  findPossibleDuplicates,
  type PossibleDuplicate,
  type ClientStatus,
  type PreferredContactMethod,
} from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";
const NONE = "__none__";

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "inactive", label: "Inactive" },
];
const CONTACT_METHOD_OPTIONS: { value: PreferredContactMethod; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
];

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  address: "",
  status: "lead" as ClientStatus,
  lead_source: "",
  preferred_contact_method: "" as PreferredContactMethod | "",
};

/** Full-page "New client" (/clients/new) and "Edit client"
 * (/clients/:clientId/edit) — replaces the old modal. */
export function ClientFormView() {
  const { clientId } = useParams();
  const isEdit = !!clientId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const { data: allClients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients, enabled: !isEdit });
  const [duplicate, setDuplicate] = useState<PossibleDuplicate | null>(null);
  const [createAnyway, setCreateAnyway] = useState(false);
  const { data: client, isLoading, isError } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        address: client.address ?? "",
        status: client.status,
        lead_source: client.lead_source ?? "",
        preferred_contact_method: client.preferred_contact_method ?? "",
      });
    }
  }, [client]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        lead_source: form.lead_source.trim(),
        preferred_contact_method: form.preferred_contact_method || null,
      };
      if (isEdit) {
        await updateClient(clientId!, {
          name: payload.name,
          email: payload.email || null,
          phone: payload.phone || null,
          address: payload.address || null,
          status: form.status,
          lead_source: payload.lead_source || null,
          preferred_contact_method: form.preferred_contact_method || null,
        });
        return clientId!;
      }
      // Same phone or email as an existing client → stop and ask (the picker
      // elsewhere already did this; this page created duplicates silently).
      if (!createAnyway) {
        const dup = findPossibleDuplicates({ email: payload.email, phone: payload.phone }, allClients).find((d) => d.reason !== "name");
        if (dup) {
          setDuplicate(dup);
          return null;
        }
      }
      const created = await createClient(payload);
      return created.id;
    },
    onSuccess: (id) => {
      if (id === null) return; // stopped at the duplicate prompt
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (isEdit) qc.invalidateQueries({ queryKey: ["client", clientId] });
      navigate("/clients");
    },
    onError: (err: Error) =>
      toast({
        title: isEdit ? "Couldn't save client" : "Couldn't add client",
        description: err.message,
        variant: "destructive",
      }),
  });

  const canSave = form.name.trim().length > 0;

  if (isEdit && isLoading) {
    return <p className="text-muted-foreground">Loading client…</p>;
  }
  if (isEdit && isError) {
    return <p className="text-destructive">Couldn't load that client.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <BackLink
        to="/clients"
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >Clients</BackLink>

      <h1 className="text-[28px] font-bold tracking-tight text-foreground">
        {isEdit ? "Edit client" : "New client"}
      </h1>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <User className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Client details</span>
        </div>

        <div className="space-y-5 bg-card p-5">
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Client name</div>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Enter client name"
              autoFocus={!isEdit}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Email</div>
            <Input
              id="client-email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="client@email.com"
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Phone</div>
            <Input
              id="client-phone"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="(555) 123-4567"
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>
              Address <span className="normal-case text-muted-foreground">(optional)</span>
            </div>
            <Input
              id="client-address"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="123 Oak Street, Springfield"
              className={FIELD_INPUT}
            />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <div className={FIELD_LABEL}>Status</div>
              <Select value={form.status} onValueChange={(v) => set({ status: v as ClientStatus })}>
                <SelectTrigger className={FIELD_INPUT}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>
              Lead source <span className="normal-case text-muted-foreground">(optional)</span>
            </div>
            <Input
              id="client-lead-source"
              value={form.lead_source}
              onChange={(e) => set({ lead_source: e.target.value })}
              placeholder="Referral, Google, word of mouth…"
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>
              Preferred contact method <span className="normal-case text-muted-foreground">(optional)</span>
            </div>
            <Select
              value={form.preferred_contact_method || NONE}
              onValueChange={(v) =>
                set({ preferred_contact_method: v === NONE ? "" : (v as PreferredContactMethod) })
              }
            >
              <SelectTrigger className={FIELD_INPUT}>
                <SelectValue placeholder="No preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No preference</SelectItem>
                {CONTACT_METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {duplicate && (
        <div className="rounded-card border border-warning-strong/50 bg-warning-strong/10 p-4 text-sm">
          <p className="font-semibold text-foreground">
            {duplicate.client.name} already has this {duplicate.reason === "phone" ? "phone number" : "email"}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link to={`/clients/${duplicate.client.id}`}>Open {duplicate.client.name}</Link>
            </Button>
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setCreateAnyway(true);
                setDuplicate(null);
              }}
            >
              It's a different person — create anyway
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/clients")} className="h-11 rounded-xl">
          Cancel
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!canSave || saveMut.isPending}
          className="h-11 rounded-xl font-bold"
        >
          {saveMut.isPending
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : "Create client"}
        </Button>
      </div>
    </div>
  );
}

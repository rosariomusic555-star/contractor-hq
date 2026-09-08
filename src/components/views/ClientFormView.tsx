import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getClient, createClient, updateClient } from "@/lib/api";

const EMPTY = { name: "", email: "", phone: "", address: "" };

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
      };
      if (isEdit) {
        await updateClient(clientId!, {
          name: payload.name,
          email: payload.email || null,
          phone: payload.phone || null,
          address: payload.address || null,
        });
        return clientId!;
      }
      const created = await createClient(payload);
      return created.id;
    },
    onSuccess: () => {
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
      <Link
        to="/clients"
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Clients
      </Link>

      <h1 className="text-[28px] font-bold tracking-tight text-foreground">
        {isEdit ? "Edit client" : "New client"}
      </h1>

      <div className="card-surface space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="client-name">Client name</Label>
          <Input
            id="client-name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Enter client name"
            autoFocus={!isEdit}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-email">Email</Label>
          <Input
            id="client-email"
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="client@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-phone">Phone</Label>
          <Input
            id="client-phone"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="(555) 123-4567"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-address">
            Address <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="client-address"
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="123 Oak Street, Springfield"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/clients")}>
          Cancel
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!canSave || saveMut.isPending}
          className="font-bold"
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

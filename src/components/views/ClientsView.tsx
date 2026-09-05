import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MoreHorizontal, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientModal } from "@/components/modals/ClientModal";
import { useToast } from "@/hooks/use-toast";
import { listClients, createClient, deleteClient, listInvoices, listProjects } from "@/lib/api";

export function ClientsView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Dashboard's "Add Client" quick action links here with ?new=1 to open
  // the modal immediately instead of landing on the plain list.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: clients = [], isLoading, isError, error } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createMutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't add client", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete client", description: err.message, variant: "destructive" }),
  });

  // Derived per-client stats, keyed by client id.
  const statsByClient = useMemo(() => {
    const projectClient = new Map<string, string | null>(); // project id -> client id
    const map = new Map<string, { projects: number; revenue: number }>();
    const ensure = (clientId: string) => {
      if (!map.has(clientId)) map.set(clientId, { projects: 0, revenue: 0 });
      return map.get(clientId)!;
    };
    projects.forEach((p) => {
      projectClient.set(p.id, p.client_id);
      if (p.client_id) ensure(p.client_id).projects += 1;
    });
    invoices.forEach((inv) => {
      const clientId = inv.project_id ? (projectClient.get(inv.project_id) ?? null) : null;
      if (clientId) ensure(clientId).revenue += Number(inv.amount);
    });
    return map;
  }, [projects, invoices]);

  const filteredClients = clients.filter((client) => {
    const term = searchTerm.toLowerCase();
    return (
      client.name.toLowerCase().includes(term) ||
      (client.email ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">{clients.length} total clients</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading clients…</p>}
      {isError && (
        <p className="text-destructive">Failed to load clients: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const stats = statsByClient.get(client.id);
            const totalProjects = stats?.projects ?? 0;
            const totalRevenue = stats?.revenue ?? 0;

            return (
              <div key={client.id} className="stat-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-lg font-semibold text-primary-foreground">
                        {client.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{client.name}</h3>
                      <p className="text-sm text-muted-foreground">{totalProjects} projects</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(client.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span>{client.email ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{client.phone ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{client.address ?? "—"}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Revenue</span>
                    <span className="text-lg font-bold text-foreground">
                      ${totalRevenue.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredClients.length === 0 && (
            <p className="text-muted-foreground text-sm">No clients yet.</p>
          )}
        </div>
      )}

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}

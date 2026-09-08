import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientModal, type ClientFormData } from "@/components/modals/ClientModal";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { FilterSegment, FilterPills, type FilterOption } from "@/components/common/FilterControls";
import { ListCard } from "@/components/common/ListCard";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  listInvoices,
  listProjects,
  type Client,
} from "@/lib/api";

type Kind = "active" | "repeat" | "lead" | "client";
type Filter = "all" | "active" | "repeat" | "lead";

const KIND_META: Record<Kind, { label: string; tone: string; border: string }> = {
  active: { label: "Active", tone: "text-success", border: "hsl(var(--success))" },
  repeat: { label: "Repeat client", tone: "text-info", border: "hsl(var(--info))" },
  lead: { label: "Lead", tone: "text-muted-subtle", border: "hsl(var(--border))" },
  client: { label: "Client", tone: "text-muted-subtle", border: "hsl(var(--border))" },
};

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

export function ClientsView() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createMutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't add client", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientFormData }) =>
      updateClient(id, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't save client", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete client", description: err.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const projectClient = new Map<string, string | null>();
    const map = new Map<string, { projects: number; active: number; revenue: number; kind: Kind }>();
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, { projects: 0, active: 0, revenue: 0, kind: "lead" });
      return map.get(id)!;
    };
    for (const p of projects) {
      projectClient.set(p.id, p.client_id);
      if (p.client_id) {
        const s = ensure(p.client_id);
        s.projects += 1;
        if (p.status !== "paid") s.active += 1;
      }
    }
    for (const inv of invoices) {
      const cid = inv.project_id ? projectClient.get(inv.project_id) ?? null : null;
      if (cid) ensure(cid).revenue += Number(inv.amount);
    }
    for (const s of map.values()) {
      s.kind = s.active > 0 ? "active" : s.projects > 1 ? "repeat" : s.projects === 0 ? "lead" : "client";
    }
    return map;
  }, [projects, invoices]);

  const get = (id: string) => stats.get(id) ?? { projects: 0, active: 0, revenue: 0, kind: "lead" as Kind };
  const lifetime = [...stats.values()].reduce((a, s) => a + s.revenue, 0);
  const withActive = [...stats.values()].filter((s) => s.active > 0).length;
  const countKind = (k: Kind) => clients.filter((c) => get(c.id).kind === k).length;

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: clients.length },
    { value: "active", label: "Active", count: countKind("active") },
    { value: "repeat", label: "Repeat", count: countKind("repeat") },
    { value: "lead", label: "Leads", count: countKind("lead") },
  ];

  const filtered = clients.filter((c) => {
    if (filter !== "all" && get(c.id).kind !== filter) return false;
    const term = search.toLowerCase();
    return (
      !term ||
      c.name.toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term) ||
      (c.address ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader
        title="Clients"
        subtitle={`${pluralize(clients.length, "client")} · ${formatCurrency(lifetime)} lifetime`}
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-8 rounded-[0.625rem] bg-sidebar-primary px-3 text-[13px] font-bold text-sidebar-primary-foreground"
          >
            + Add
          </button>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, email, address"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Clients"
        subtitle={`${pluralize(clients.length, "client")} · ${withActive} with active work · ${formatCurrency(lifetime)} lifetime`}
        actions={
          <Button onClick={() => setIsModalOpen(true)} className="font-bold">
            + Add client
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <FilterPills className="md:hidden" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, address" className="hidden md:flex md:max-w-xs" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading clients…</p>}
      {isError && <p className="text-destructive">Failed to load clients: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          {/* Desktop card grid */}
          <div className="hidden gap-3.5 md:grid md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((client) => {
              const s = get(client.id);
              const kind = KIND_META[s.kind];
              return (
                <div key={client.id} className="card-surface p-[18px]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
                        {initials(client.name)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-bold tracking-tight text-foreground">{client.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {s.projects} project{s.projects === 1 ? "" : "s"} ·{" "}
                          <span className={cn("font-semibold", kind.tone)}>{kind.label}</span>
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(client)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(client.id)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-[13px] text-muted-foreground">
                    <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" />{client.email ?? "—"}</p>
                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{client.phone ?? "—"}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{client.address ?? "—"}</p>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between border-t border-hairline pt-3.5">
                    <span className="text-xs font-semibold text-muted-foreground">Lifetime revenue</span>
                    <span className="text-base font-extrabold tabular-nums text-foreground">
                      {formatCurrency(s.revenue)}
                    </span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No clients here.</p>}
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((client) => {
              const s = get(client.id);
              const kind = KIND_META[s.kind];
              return (
                <ListCard
                  key={client.id}
                  onClick={() => setEditing(client)}
                  borderColor={kind.border}
                  eyebrow={`${kind.label} · ${s.projects} project${s.projects === 1 ? "" : "s"}`}
                  eyebrowColor={kind.border}
                  eyebrowRight={formatCurrency(s.revenue)}
                  title={client.name}
                  subtitle={`${client.phone ?? client.email ?? "—"}${client.address ? ` · ${client.address}` : ""}`}
                />
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No clients here.</p>}
          </div>
        </>
      )}

      <ClientModal
        isOpen={isModalOpen || !!editing}
        onClose={() => {
          setIsModalOpen(false);
          setEditing(null);
        }}
        initial={editing ?? undefined}
        title={editing ? "Edit client" : "Add New Client"}
        submitLabel={editing ? "Save changes" : "Add Client"}
        onSubmit={(data) =>
          editing
            ? updateMutation.mutate({ id: editing.id, data })
            : createMutation.mutate(data)
        }
      />
    </div>
  );
}

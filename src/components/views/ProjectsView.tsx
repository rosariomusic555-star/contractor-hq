import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectModal } from "@/components/modals/ProjectModal";
import { useToast } from "@/hooks/use-toast";
import {
  listProjects,
  listClients,
  listQuotes,
  listInvoices,
  createProject,
  deleteProject,
  quoteTotal,
  type ProjectStatus,
} from "@/lib/api";

const statusStyles: Record<ProjectStatus, string> = {
  draft: "badge-status badge-draft",
  active: "badge-status badge-pending",
  completed: "badge-status badge-paid",
  archived: "badge-status badge-draft",
};

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function ProjectsView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: projects = [], isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't create project", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't delete project", description: err.message, variant: "destructive" }),
  });

  const totalsByProject = useMemo(() => {
    const map = new Map<string, { quoted: number; invoiced: number }>();
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, { quoted: 0, invoiced: 0 });
      return map.get(id)!;
    };
    quotes.forEach((q) => { ensure(q.project_id).quoted += quoteTotal(q.quote_sections); });
    invoices.forEach((i) => { ensure(i.project_id).invoiced += Number(i.amount); });
    return map;
  }, [quotes, invoices]);

  const filtered = projects.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.client?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">{projects.length} total projects</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading projects…</p>}
      {isError && (
        <p className="text-destructive">Failed to load projects: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && (
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="bg-muted/50">
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Quoted</th>
                  <th>Invoiced</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => {
                  const totals = totalsByProject.get(project.id) ?? { quoted: 0, invoiced: 0 };
                  return (
                    <tr
                      key={project.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <td className="font-medium">{project.name}</td>
                      <td className="text-muted-foreground">{project.client?.name ?? "—"}</td>
                      <td>
                        <span className={statusStyles[project.status]}>
                          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                        </span>
                      </td>
                      <td className="font-semibold">{currency(totals.quoted)}</td>
                      <td className="text-muted-foreground">{currency(totals.invoiced)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(project.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground text-center py-8">
                      No projects yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clients={clients}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}

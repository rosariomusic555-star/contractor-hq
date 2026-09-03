import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectModal, type ProjectSubmit } from "@/components/modals/ProjectModal";
import { useToast } from "@/hooks/use-toast";
import { listProjects, listClients, createProject, createClient } from "@/lib/api";
import { projectStatusMeta } from "@/lib/projectStatus";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ProjectsView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: projects = [], isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const createMutation = useMutation({
    mutationFn: async (data: ProjectSubmit) => {
      let clientId = data.clientId;
      if (data.newClient) {
        const client = await createClient({ ...data.newClient, address: "" });
        clientId = client.id;
      }
      return createProject({ name: data.name, client_id: clientId, status: "draft" });
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setIsModalOpen(false);
      navigate(`/projects/${project.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create project", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Projects</h1>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading projects…</p>}
      {isError && (
        <p className="text-destructive">Failed to load projects: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const meta = projectStatusMeta(project.status);
            return (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="stat-card text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-foreground">{project.name}</h3>
                  <span className={meta.badge}>{meta.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">{project.client?.name ?? "No client"}</p>
                <p className="text-xs text-muted-foreground mt-4">
                  Created {formatDate(project.created_at)}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clients={clients}
        submitting={createMutation.isPending}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { pluralize } from "@/lib/utils";
import { deleteCrew, listCrews, listProjects, saveCrew, type Crew } from "@/lib/api";

/**
 * Settings › Team & crews (0120) — real crews now (this page used to show
 * demo data). A job gets one crew on its Schedule card; the rain-delay
 * cascade shifts only that crew's later jobs. Logins for crew members are
 * in Manage employees.
 */
export function SettingsTeamView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: crews = [], isLoading } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");

  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const save = useMutation({
    mutationFn: () => saveCrew({ id: editing && editing !== "new" ? editing : undefined, name, lead, sort_order: editing === "new" ? crews.length : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crews"] });
      setEditing(null);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: deleteCrew,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crews"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError,
  });

  const startEdit = (c: Crew | null) => {
    setEditing(c?.id ?? "new");
    setName(c?.name ?? "");
    setLead(c?.lead ?? "");
  };
  const jobsOn = (id: string) => projects.filter((p) => p.crew_id === id && (p.status === "scheduled" || p.status === "in_progress")).length;

  const form = (
    <div className="space-y-2 py-3.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input autoFocus placeholder="Crew name (e.g. Crew A)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Lead (optional)" value={lead} onChange={(e) => setLead(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
          Cancel
        </Button>
        <Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Team & crews" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Team & crews</h1>
      </div>

      <div className="overflow-hidden rounded-card border border-border shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
              <Users className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold text-background">Crews</span>
          </div>
          <span className="text-xs font-semibold text-background/70">{pluralize(crews.length, "crew")}</span>
        </div>

        <div className="divide-y divide-hairline bg-card px-5">
          {isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && crews.length === 0 && editing !== "new" && (
            <p className="py-4 text-sm text-muted-foreground">No crews yet. Add one, then pick it on each job's Schedule card.</p>
          )}
          {crews.map((c) =>
            editing === c.id ? (
              <div key={c.id}>{form}</div>
            ) : (
              <div key={c.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.lead ? `Led by ${c.lead} · ` : ""}
                    {pluralize(jobsOn(c.id), "scheduled job")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${c.name}`} onClick={() => startEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={`Delete ${c.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ),
          )}
          {editing === "new" && form}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Deleting a crew leaves its jobs with no crew. Crew logins are in{" "}
          <Link to="/settings/employees" className="font-semibold text-primary hover:text-primary/80">
            Manage employees
          </Link>
          .
        </p>
        {editing === null && (
          <Button className="h-11 rounded-xl font-bold" onClick={() => startEdit(null)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add crew
          </Button>
        )}
      </div>
    </div>
  );
}

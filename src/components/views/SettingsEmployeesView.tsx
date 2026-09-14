import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  listEmployees,
  createEmployeeAccount,
  updateEmployee,
  listEmployeeAssignments,
  assignProjectToEmployee,
  unassignProjectFromEmployee,
  listProjects,
  type Employee,
  type EmployeeStatus,
  type Project,
} from "@/lib/api";

/**
 * Owner-only: create employee logins directly (no self-signup — see
 * create-employee Edge Function), assign/unassign specific projects, and
 * deactivate an employee (a DB flag every employee-scoped RLS policy
 * checks — takes effect immediately, no need to touch their Auth login).
 */
export function SettingsEmployeesView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: employees = [], isLoading } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createMut = useMutation({
    mutationFn: createEmployeeAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setAddOpen(false);
      toast({ title: "Employee created" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmployeeStatus }) => updateEmployee(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader
        title="Manage employees"
        back={{ to: "/settings", label: "Settings" }}
        actions={
          <Button size="sm" className="font-bold" onClick={() => setAddOpen(true)}>
            + Add
          </Button>
        }
      />

      <div className="hidden md:flex md:items-center md:justify-between">
        <div>
          <Link
            to="/settings"
            className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Settings
          </Link>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Manage employees</h1>
        </div>
        <Button className="font-bold" onClick={() => setAddOpen(true)}>
          + Add employee
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && employees.length === 0 && (
        <div className="card-surface p-10 text-center text-muted-foreground">
          No employees yet. Add one to give them a restricted login that only sees the projects you assign.
        </div>
      )}

      <div className="space-y-3">
        {employees.map((emp) => (
          <EmployeeRow
            key={emp.id}
            employee={emp}
            projects={projects}
            expanded={expandedId === emp.id}
            onToggleExpand={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
            onToggleStatus={() =>
              statusMut.mutate({ id: emp.id, status: emp.status === "active" ? "deactivated" : "active" })
            }
          />
        ))}
      </div>

      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(input) => createMut.mutate(input)}
        creating={createMut.isPending}
      />
    </div>
  );
}

function EmployeeRow({
  employee,
  projects,
  expanded,
  onToggleExpand,
  onToggleStatus,
}: {
  employee: Employee;
  projects: Project[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: assignments = [] } = useQuery({
    queryKey: ["employee-assignments", employee.id],
    queryFn: () => listEmployeeAssignments(employee.id),
    enabled: expanded,
  });
  const assignedIds = new Set(assignments.map((a) => a.project_id));

  const toggleMut = useMutation({
    mutationFn: ({ projectId, assign }: { projectId: string; assign: boolean }) =>
      assign
        ? assignProjectToEmployee(employee.id, projectId)
        : unassignProjectFromEmployee(employee.id, projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-assignments", employee.id] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="card-surface p-4">
      <button type="button" onClick={onToggleExpand} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="font-bold text-foreground">{employee.name}</div>
          <div className="truncate text-xs text-muted-foreground">{employee.email}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("badge-status", employee.status === "active" ? "badge-paid" : "badge-declined")}>
            {employee.status === "active" ? "Active" : "Deactivated"}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-subtle transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-hairline pt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Assigned projects</div>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {projects.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={assignedIds.has(p.id)}
                    onCheckedChange={(v) => toggleMut.mutate({ projectId: p.id, assign: v === true })}
                  />
                  <span className="text-sm text-foreground">{p.name}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleStatus}
            className="text-xs font-bold text-destructive hover:underline"
          >
            {employee.status === "active" ? "Deactivate employee" : "Reactivate employee"}
          </button>
        </div>
      )}
    </div>
  );
}

function AddEmployeeDialog({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; email: string; password: string }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setPassword("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="emp-name">Name</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Rivera" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-email">Email</Label>
            <Input
              id="emp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-password">Password</Label>
            <Input
              id="emp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              placeholder="At least 6 characters"
            />
            <p className="text-xs text-muted-foreground">
              Share this with them directly — they can change it after signing in.
            </p>
          </div>
        </div>
        <Button
          className="w-full font-bold"
          disabled={creating || !name.trim() || !email.trim() || password.length < 6}
          onClick={() => onCreate({ name: name.trim(), email: email.trim(), password })}
        >
          {creating ? "Creating…" : "Create employee"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

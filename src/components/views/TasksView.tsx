import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FilterPills, FilterSegment, type FilterOption } from "@/components/common/FilterControls";
import { ClientCombobox } from "@/components/common/ClientPicker";
import { useClientField } from "@/hooks/use-client-field";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import {
  listTasks,
  createTask,
  setTaskCompleted,
  TASK_TYPE_LABEL,
  CREATABLE_TASK_TYPES,
  type Task,
  type TaskType,
  type TaskPriority,
} from "@/lib/api";
import { localYmd } from "@/lib/appointmentTime";
import { dayHeading, groupFromDate } from "@/lib/upcoming";
import { FromDateControl } from "@/components/common/FromDateControl";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

type Filter = "upcoming" | "overdue" | "completed" | "all";

// Local "today" (a UTC slice flipped to tomorrow in the evening and made
// today's tasks look overdue). due_at comes from a date picker, so its
// stored date part is the day that was picked.
const todayStr = () => localYmd(new Date());
const dateStr = (task: Task) => (task.due_at ? task.due_at.slice(0, 10) : null);

function bucketTask(task: Task): Exclude<Filter, "all"> {
  if (task.completed) return "completed";
  const d = dateStr(task);
  if (d && d < todayStr()) return "overdue";
  return "upcoming";
}

export function TasksView() {
  const [filter, setFilter] = useState<Filter>("upcoming");
  // Upcoming = everything due on/after this date (default today), by day.
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks"], queryFn: listTasks });

  const completeMut = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => setTaskCompleted(id, completed),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const upcomingGroups = groupFromDate(
    tasks.filter((t) => !t.completed),
    dateStr,
    from,
    today,
    { includeUndated: from === today },
  );
  const buckets = {
    upcoming: upcomingGroups.flatMap((g) => g.items),
    overdue: tasks.filter((t) => bucketTask(t) === "overdue"),
    completed: tasks.filter((t) => bucketTask(t) === "completed"),
  };
  const filtered = filter === "all" ? tasks : buckets[filter];

  const options: FilterOption<Filter>[] = [
    { value: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { value: "overdue", label: "Overdue", count: buckets.overdue.length },
    { value: "completed", label: "Completed", count: buckets.completed.length },
    { value: "all", label: "All", count: tasks.length },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Tasks</h1>
          <p className="mt-0.5 text-muted-foreground">{pluralize(tasks.length, "task")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="font-bold">
          <Plus className="mr-2 h-4 w-4" />
          New task
        </Button>
      </div>

      <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={(v) => setFilter(v as Filter)} />
      <FilterPills className="md:hidden" options={options} value={filter} onChange={(v) => setFilter(v as Filter)} />
      {filter === "upcoming" && <FromDateControl value={from} onChange={setFrom} today={today} />}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {filter === "upcoming" ? (
        <div className="space-y-4">
          {upcomingGroups.length === 0 && !isLoading && (
            <div className="card-surface p-10 text-center text-muted-foreground">Nothing due from {from === today ? "today" : dayHeading(from, today)} on.</div>
          )}
          {upcomingGroups.map((g) => (
            <div key={g.key ?? "none"} className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{g.heading}</p>
              {g.items.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={(v) => completeMut.mutate({ id: task.id, completed: v })} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && !isLoading && (
            <div className="card-surface p-10 text-center text-muted-foreground">Nothing here.</div>
          )}
          {filtered.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={(v) => completeMut.mutate({ id: task.id, completed: v })} />
          ))}
        </div>
      )}

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function TaskRow({ task, onToggle }: { task: Task; onToggle: (completed: boolean) => void }) {
  const bucket = bucketTask(task);
  return (
    <div className="flex items-start gap-3 card-surface p-3.5">
      <Checkbox checked={task.completed} onCheckedChange={(v) => onToggle(v === true)} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold text-foreground", task.completed && "line-through text-muted-foreground")}>
            {task.title}
          </span>
          {bucket === "overdue" && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">Overdue</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{TASK_TYPE_LABEL[task.task_type]}</span>
          {task.client?.name && (
            <>
              <span>·</span>
              <Link to={`/clients/${task.client_id}`} className="hover:text-primary hover:underline">
                {task.client.name}
              </Link>
            </>
          )}
          {task.due_at && (
            <>
              <span>·</span>
              <span>{dateStr(task)}</span>
            </>
          )}
          {task.priority === "high" && (
            <>
              <span>·</span>
              <span className="font-semibold text-warning">High priority</span>
            </>
          )}
        </div>
      </div>
      {task.completed && <Check className="h-4 w-4 shrink-0 text-success" />}
    </div>
  );
}

function CreateTaskDialogInner({
  open,
  onOpenChange,
  defaultClientId,
  defaultOpportunityId,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string | null;
  defaultOpportunityId?: string | null;
  defaultProjectId?: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("general_task");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueAt, setDueAt] = useState("");
  const client = useClientField(defaultClientId ?? null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setTaskType("general_task");
      setPriority("normal");
      setDueAt("");
      client.reset(defaultClientId ?? null);
    }
  }, [open, defaultClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMut = useMutation({
    mutationFn: async () => {
      const clientId = await client.ensureClient();
      if (clientId === undefined) return null;
      return createTask({
        title: title.trim(),
        task_type: taskType,
        priority,
        due_at: dueAt || null,
        client_id: clientId,
        opportunity_id: defaultOpportunityId ?? null,
        project_id: defaultProjectId ?? null,
      });
    },
    onSuccess: (task) => {
      if (!task) return;
      qc.invalidateQueries({ queryKey: ["tasks"] });
      if (defaultClientId) qc.invalidateQueries({ queryKey: ["client-tasks", defaultClientId] });
      if (defaultOpportunityId) qc.invalidateQueries({ queryKey: ["opportunity-tasks", defaultOpportunityId] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!defaultClientId && (
              <ClientCombobox
                field={client}
                label="Customer"
                optional
                onCreateAnyway={() => {
                  client.acceptDuplicate();
                  createMut.mutate();
                }}
              />
            )}
          </div>
          <Button className="w-full font-bold" disabled={!title.trim() || (!!client.draft && !client.hasClient) || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? "Creating…" : "Create task"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const CreateTaskDialog = withErrorBoundary(CreateTaskDialogInner, "CreateTaskDialog");

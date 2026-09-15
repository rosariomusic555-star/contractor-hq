import { AlertCircle, CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listTasks, TASK_TYPE_LABEL } from "@/lib/api";

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Overdue + due-today follow-ups on the home dashboard (CRM Phase 3's
 * own explicit ask: "Overdue or upcoming follow-ups should appear
 * clearly on the home dashboard"). Same card shape/conventions as
 * NeedsYou.tsx. */
export function FollowUpsCard({ className }: { className?: string }) {
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: listTasks });

  const today = todayStr();
  const open = tasks.filter((t) => !t.completed && t.due_at);
  const overdue = open.filter((t) => t.due_at!.slice(0, 10) < today).sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const dueToday = open.filter((t) => t.due_at!.slice(0, 10) === today);
  const items = [...overdue, ...dueToday].slice(0, 6);

  return (
    <section className={cn("card-surface p-5", className)}>
      <h3 className="text-base font-bold text-foreground">
        Follow-ups <span className="text-muted-foreground">· {overdue.length + dueToday.length}</span>
      </h3>

      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No overdue or due-today follow-ups.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {items.map((task) => {
            const isOverdue = task.due_at!.slice(0, 10) < today;
            return (
              <li key={task.id}>
                <Link
                  to="/tasks"
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      isOverdue ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isOverdue ? <AlertCircle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {TASK_TYPE_LABEL[task.task_type]}
                      {task.client?.name ? ` · ${task.client.name}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">
                    {isOverdue ? "Overdue" : "Today"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

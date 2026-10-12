import { CalendarCheck, CalendarClock, CalendarRange, CircleAlert } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import type { Task } from "@/lib/api";
import { count, inNextDays, inWeek } from "@/lib/bannerMetrics";

/** No screen assigns tasks (assigned_to is never set), so the spec's
 *  "assigned to me" chip has no data and is skipped. `next7` and
 *  `done_week` are tile-only filters. */
export type TaskChip = "overdue" | "today" | "next7" | "done_week";

type T = Pick<Task, "due_at" | "completed" | "completed_at">;

/** The picked day (due_at's date part — see TasksView). */
const dueDay = (t: T) => (t.due_at ? t.due_at.slice(0, 10) : null);

export function taskChipMatch(t: T, chip: TaskChip, today: string, now: Date): boolean {
  const d = dueDay(t);
  switch (chip) {
    case "overdue":
      return !t.completed && !!d && d < today;
    case "today":
      return !t.completed && d === today;
    case "next7":
      return !t.completed && inNextDays(d, 7, now);
    case "done_week":
      return t.completed && inWeek(t.completed_at, now);
  }
}

export function taskBannerStats(tasks: T[], today: string, now: Date) {
  const n = (c: TaskChip) => tasks.filter((t) => taskChipMatch(t, c, today, now)).length;
  return {
    total: tasks.length,
    open: tasks.filter((t) => !t.completed).length,
    overdue: n("overdue"),
    today: n("today"),
    next7: n("next7"),
    doneWeek: n("done_week"),
  };
}

export function useTasksBanner({
  tasks,
  today,
  loading,
  chip,
  setChip,
}: {
  tasks: T[];
  today: string;
  loading: boolean;
  chip: TaskChip | null;
  setChip: (c: TaskChip | null) => void;
}): { rich: RichBanner; matches: (t: T) => boolean } {
  const now = new Date();
  const st = taskBannerStats(tasks, today, now);

  let insight: string;
  if (st.total === 0) insight = "No tasks yet — add one to keep track of follow-ups";
  else if (st.overdue || st.today)
    insight = [st.today ? `${count(st.today, "task")} due today` : null, st.overdue ? `${st.overdue} overdue` : null].filter(Boolean).join(" · ");
  else if (st.open) insight = `Nothing due today · ${st.next7} in the next 7 days`;
  else insight = "All caught up — every task is done";

  const pick = (c: TaskChip) => setChip(chip === c ? null : c);
  const rich: RichBanner = {
    insight,
    loading,
    listId: "tasks-list",
    activeChip: chip,
    onChip: (k) => setChip(k as TaskChip | null),
    chips: [
      { key: "overdue", label: "overdue", count: st.overdue },
      { key: "today", label: "due today", count: st.today },
      { key: "next7", label: "due in the next 7 days", count: st.next7, hidden: true },
      { key: "done_week", label: "completed this week", count: st.doneWeek, hidden: true },
    ],
    tiles: [
      {
        key: "today",
        label: "Due today",
        icon: CalendarCheck,
        value: st.total ? String(st.today) : "—",
        sub: st.total ? (st.today ? "still open" : "Nothing due today") : "Add a task to see this",
        onClick: st.today ? () => pick("today") : undefined,
        active: chip === "today",
      },
      {
        key: "overdue",
        label: "Overdue",
        icon: CircleAlert,
        value: st.total ? String(st.overdue) : "—",
        alert: st.overdue > 0,
        sub: st.overdue ? "past their due date" : st.total ? "Nothing overdue" : "Late tasks show here",
        subTone: st.total && !st.overdue ? "positive" : "muted",
        onClick: st.overdue ? () => pick("overdue") : undefined,
        active: chip === "overdue",
      },
      {
        key: "next7",
        label: "Next 7 days",
        icon: CalendarRange,
        value: st.total ? String(st.next7) : "—",
        sub: st.total ? "due, including today" : "Upcoming tasks show here",
        onClick: st.next7 ? () => pick("next7") : undefined,
        active: chip === "next7",
      },
      {
        key: "done",
        label: "Completed this week",
        icon: CalendarClock,
        value: st.total ? String(st.doneWeek) : "—",
        sub: st.total ? (st.doneWeek ? "nice work" : "None checked off yet") : "Finished tasks show here",
        subTone: st.doneWeek ? "positive" : "muted",
        onClick: st.doneWeek ? () => pick("done_week") : undefined,
        active: chip === "done_week",
      },
    ],
  };
  return { rich, matches: (t) => !chip || taskChipMatch(t, chip, today, now) };
}

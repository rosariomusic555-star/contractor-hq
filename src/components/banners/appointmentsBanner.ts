import { CalendarCheck, CalendarDays, Clock, History } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { APPOINTMENT_TYPE_LABEL, type Appointment } from "@/lib/api";
import { appointmentDateKey, appointmentHasPassed, appointmentTimeLabel, compareAppointments } from "@/lib/appointmentTime";
import { count, inLastDays, inWeek } from "@/lib/bannerMetrics";

/** `last30` is a tile-only filter. "Needs follow-up" = the appointment's
 *  time has passed and it was never checked off (still Scheduled) — the
 *  same "overdue site visit" idea the Pipeline cards flag. */
export type AppointmentChip = "today" | "week" | "follow_up" | "last30";

type A = Pick<Appointment, "id" | "date_time" | "all_day" | "status" | "type" | "client_id" | "opportunity_id" | "client">;

export function appointmentChipMatch(a: A, chip: AppointmentChip, today: string, now: Date): boolean {
  const day = appointmentDateKey(a);
  switch (chip) {
    case "today":
      return a.status === "scheduled" && day === today;
    case "week":
      return a.status === "scheduled" && inWeek(day, now) && day >= today;
    case "follow_up":
      return a.status === "scheduled" && appointmentHasPassed(a, now) && day < today;
    case "last30":
      return a.status !== "cancelled" && inLastDays(day, 30, now) && appointmentHasPassed(a, now);
  }
}

export function appointmentBannerStats(appts: A[], today: string, now: Date) {
  const n = (c: AppointmentChip) => appts.filter((a) => appointmentChipMatch(a, c, today, now)).length;
  const next = appts.filter((a) => a.status === "scheduled" && !appointmentHasPassed(a, now)).sort(compareAppointments)[0] ?? null;
  return { total: appts.length, today: n("today"), week: n("week"), followUp: n("follow_up"), last30: n("last30"), next };
}

export function useAppointmentsBanner({
  appointments,
  today,
  loading,
  chip,
  setChip,
}: {
  appointments: A[];
  today: string;
  loading: boolean;
  chip: AppointmentChip | null;
  setChip: (c: AppointmentChip | null) => void;
}): { rich: RichBanner; matches: (a: A) => boolean } {
  const now = new Date();
  const st = appointmentBannerStats(appointments, today, now);
  const next = st.next;
  const nextWhen = next
    ? [
        appointmentDateKey(next) === today ? "Today" : new Date(next.date_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        appointmentTimeLabel(next),
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  let insight: string;
  if (st.total === 0) insight = "No appointments yet — book your first site visit";
  else
    insight =
      [
        st.today ? `${count(st.today, "appointment")} today` : null,
        st.week > st.today ? `${st.week} this week` : null,
        st.followUp ? `${st.followUp} need${st.followUp === 1 ? "s" : ""} follow-up` : null,
      ]
        .filter(Boolean)
        .join(" · ") || (next ? `Nothing this week · next one ${nextWhen}` : "Nothing on the calendar");

  const pick = (c: AppointmentChip) => setChip(chip === c ? null : c);
  const rich: RichBanner = {
    insight,
    loading,
    listId: "appointments-list",
    activeChip: chip,
    onChip: (k) => setChip(k as AppointmentChip | null),
    chips: [
      { key: "today", label: "today", count: st.today },
      { key: "week", label: "this week", count: st.week },
      { key: "follow_up", label: "need follow-up", count: st.followUp },
      { key: "last30", label: "in the last 30 days", count: st.last30, hidden: true },
    ],
    tiles: [
      {
        key: "today",
        label: "Today",
        icon: CalendarCheck,
        value: st.total ? String(st.today) : "—",
        sub: st.total ? (st.today ? "scheduled" : "Nothing today") : "Book a visit to see this",
        onClick: st.today ? () => pick("today") : undefined,
        active: chip === "today",
      },
      {
        key: "week",
        label: "This week",
        icon: CalendarDays,
        value: st.total ? String(st.week) : "—",
        sub: st.total ? "still to come" : "Upcoming visits show here",
        onClick: st.week ? () => pick("week") : undefined,
        active: chip === "week",
      },
      {
        key: "next",
        label: "Next appointment",
        icon: Clock,
        value: nextWhen ?? "—",
        sub: next ? [next.client?.name, APPOINTMENT_TYPE_LABEL[next.type]].filter(Boolean).join(" · ") : st.total ? "Nothing booked ahead" : "Shows once you book one",
        to: next ? (next.opportunity_id ? `/pipeline/${next.opportunity_id}` : `/clients/${next.client_id}`) : undefined,
      },
      {
        key: "last30",
        label: "Last 30 days",
        icon: History,
        value: st.total ? String(st.last30) : "—",
        sub: st.total ? "appointments held" : "Past visits show here",
        onClick: st.last30 ? () => pick("last30") : undefined,
        active: chip === "last30",
      },
    ],
  };
  return { rich, matches: (a) => !chip || appointmentChipMatch(a, chip, today, now) };
}

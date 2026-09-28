import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterPills, FilterSegment, type FilterOption } from "@/components/common/FilterControls";
import { ClientCombobox } from "@/components/common/ClientPicker";
import { useClientField } from "@/hooks/use-client-field";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import { appointmentStatusMeta } from "@/lib/statusMeta";
import { invalidateAppointmentQueries } from "@/lib/appointmentQueries";
import { dayHeading, groupFromDate } from "@/lib/upcoming";
import { FromDateControl } from "@/components/common/FromDateControl";
import {
  allDayDateTime,
  appointmentDateKey,
  appointmentHasPassed,
  appointmentTimeLabel,
  compareAppointments,
  localHm,
  localYmd,
  nextHalfHour,
  timedDateTime,
} from "@/lib/appointmentTime";
import {
  listAppointments,
  createAppointment,
  getOpportunity,
  setAppointmentStatus,
  updateAppointment,
  createQuote,
  APPOINTMENT_TYPE_LABEL,
  type Appointment,
  type AppointmentType,
} from "@/lib/api";
import { AppointmentForecastChip } from "@/components/weather/AppointmentForecastChip";

type Filter = "upcoming" | "past" | "all";

// Local dates, not UTC slices — a UTC slice put evening appointments on the
// next day (and all-day ones must land on the date that was picked).
const todayStr = () => localYmd(new Date());
const dateOf = (a: Appointment) => appointmentDateKey(a);

function bucketAppointment(a: Appointment): Exclude<Filter, "all"> {
  return dateOf(a) < todayStr() ? "past" : "upcoming";
}

/**
 * Appointments & site visits (CRM Phase 4). List-only, no calendar grid —
 * this app's scale doesn't need one and a sorted list is easier to scan
 * for "what's coming up." Completing a site visit prompts for outcome
 * notes and offers a one-click "Start estimate," which is the ask's own
 * "complete site visit -> add notes -> start an estimate" flow.
 */
export function AppointmentsView() {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: appointments = [], isLoading } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  // Upcoming = scheduled appointments on/after this date (default today —
  // today's included), grouped by day, soonest first.
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const upcomingGroups = groupFromDate(
    [...appointments].filter((a) => a.status === "scheduled").sort(compareAppointments),
    dateOf,
    from,
    today,
  );

  const buckets = {
    upcoming: upcomingGroups.flatMap((g) => g.items),
    past: appointments.filter((a) => bucketAppointment(a) === "past" || a.status !== "scheduled"),
  };
  const filtered = filter === "all" ? appointments : buckets[filter];

  const options: FilterOption<Filter>[] = [
    { value: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { value: "past", label: "Past", count: buckets.past.length },
    { value: "all", label: "All", count: appointments.length },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Appointments</h1>
          <p className="mt-0.5 text-muted-foreground">{pluralize(appointments.length, "appointment")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="font-bold">
          <Plus className="mr-2 h-4 w-4" />
          New appointment
        </Button>
      </div>

      <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={setFilter} />
      <FilterPills className="md:hidden" options={options} value={filter} onChange={setFilter} />
      {filter === "upcoming" && <FromDateControl value={from} onChange={setFrom} today={today} />}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {filter === "upcoming" ? (
        <div className="space-y-4">
          {upcomingGroups.length === 0 && !isLoading && (
            <div className="card-surface p-10 text-center text-muted-foreground">No appointments from {from === today ? "today" : dayHeading(from, today)} on.</div>
          )}
          {upcomingGroups.map((g) => (
            <div key={g.key ?? "none"} className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{g.heading}</p>
              {g.items.map((a) => (
                <AppointmentRow key={a.id} appointment={a} showClient />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && !isLoading && (
            <div className="card-surface p-10 text-center text-muted-foreground">Nothing here.</div>
          )}
          {filtered.map((a) => (
            <AppointmentRow key={a.id} appointment={a} showClient />
          ))}
        </div>
      )}

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function AppointmentRow({
  appointment,
  showClient,
  estimateAction,
}: {
  appointment: Appointment;
  showClient?: boolean;
  /** Replaces the default "Start estimate →" (a new standalone quote) — the
   * opportunity page passes its own: open the existing cost plan, or create
   * the first one, so it never starts a second estimate. */
  estimateAction?: { label: string; onClick: () => void; pending?: boolean };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const dt = new Date(appointment.date_time);
  const dateLabel = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = appointmentTimeLabel(appointment);
  const meta = appointmentStatusMeta(appointment.status);
  const overdue = appointment.status === "scheduled" && appointmentHasPassed(appointment);

  const cancelMut = useMutation({
    mutationFn: () => setAppointmentStatus(appointment, "cancelled"),
    onSuccess: () => invalidateAppointmentQueries(qc, appointment.client_id, appointment.opportunity_id),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Checkbox toggle between scheduled and completed. Completing goes through
  // setAppointmentStatus (activity log + site-visit stage auto-advance);
  // un-completing just flips the status back. Either way the outcome note is
  // kept, and the stage auto-advance is forward-only so un-completing a site
  // visit leaves the lead's stage where it is.
  const toggleMut = useMutation({
    mutationFn: (completed: boolean) =>
      completed
        ? setAppointmentStatus(appointment, "completed", appointment.outcome)
        : updateAppointment(appointment.id, { status: "scheduled" }),
    onSuccess: () => invalidateAppointmentQueries(qc, appointment.client_id, appointment.opportunity_id),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const startEstimateMut = useMutation({
    mutationFn: () => createQuote({ client_id: appointment.client_id, notes: appointment.outcome ?? null }),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-start gap-3 card-surface p-3.5">
      {appointment.status === "scheduled" || appointment.status === "completed" ? (
        <Checkbox
          checked={appointment.status === "completed"}
          disabled={toggleMut.isPending}
          onCheckedChange={(v) => toggleMut.mutate(v === true)}
          aria-label={appointment.status === "completed" ? "Mark not completed" : "Mark completed"}
          className={cn("mt-0.5", overdue && "border-destructive")}
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Calendar className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-semibold text-foreground", appointment.status === "completed" && "line-through text-muted-foreground")}>
            {APPOINTMENT_TYPE_LABEL[appointment.type]}
          </span>
          <span className={meta.badge}>{meta.label}</span>
          <AppointmentForecastChip appointment={appointment} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel}</span>
          {showClient && appointment.client?.name && (
            <>
              <span>·</span>
              <span>{appointment.client.name}</span>
            </>
          )}
          {appointment.address && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{appointment.address}</span>
            </>
          )}
        </div>
        {appointment.outcome && <p className="mt-1 text-xs text-muted-foreground">{appointment.outcome}</p>}
        {appointment.status === "scheduled" && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate()}
            >
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
          </div>
        )}
        {appointment.status === "completed" && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
            {appointment.type === "site_visit" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs font-semibold"
                disabled={estimateAction ? estimateAction.pending : startEstimateMut.isPending}
                onClick={() => (estimateAction ? estimateAction.onClick() : startEstimateMut.mutate())}
              >
                {estimateAction
                  ? estimateAction.pending
                    ? "Opening…"
                    : estimateAction.label
                  : startEstimateMut.isPending
                    ? "Starting…"
                    : "Start estimate →"}
              </Button>
            )}
          </div>
        )}
      </div>
      <EditAppointmentDialog open={editOpen} onOpenChange={setEditOpen} appointment={appointment} />
    </div>
  );
}

/** Edits a scheduled or completed appointment — the same Type / Date / Notes fields as
 * New appointment. A date-only appointment stays date-only; an older timed
 * one keeps its time of day when its date changes. Address isn't editable
 * here (it's filled automatically on create). */
export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<AppointmentType>(appointment.type);
  const [date, setDate] = useState(appointmentDateKey(appointment));
  // "" for a date-only appointment — adding a time makes it a timed one.
  const [time, setTime] = useState(appointment.all_day ? "" : localHm(new Date(appointment.date_time)));
  const [notes, setNotes] = useState(appointment.notes ?? "");

  useEffect(() => {
    if (open) {
      setType(appointment.type);
      setDate(appointmentDateKey(appointment));
      setTime(appointment.all_day ? "" : localHm(new Date(appointment.date_time)));
      setNotes(appointment.notes ?? "");
    }
    // Reset only when the dialog opens — a background refetch of
    // `appointment` mid-edit must not wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateAppointment(appointment.id, {
        type,
        date_time: time ? timedDateTime(date, time) : allDayDateTime(date),
        all_day: !time,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      invalidateAppointmentQueries(qc, appointment.client_id, appointment.opportunity_id);
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Edit appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AppointmentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(APPOINTMENT_TYPE_LABEL) as AppointmentType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {APPOINTMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AppointmentDateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
        </div>
        <Button className="w-full font-bold" disabled={!date || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAppointmentDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultOpportunityId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string | null;
  defaultOpportunityId?: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [type, setType] = useState<AppointmentType>("site_visit");
  const [date, setDate] = useState(() => nextHalfHour().ymd);
  const [time, setTime] = useState(() => nextHalfHour().hm);
  const [notes, setNotes] = useState("");
  const client = useClientField(defaultClientId ?? null);

  useEffect(() => {
    if (open) {
      // Fresh defaults each time it opens: today (or tomorrow, just before
      // midnight) at the next round half hour — never midnight.
      const next = nextHalfHour();
      setDate(next.ymd);
      setTime(next.hm);
    } else {
      setType("site_visit");
      setNotes("");
      client.reset(defaultClientId ?? null);
    }
  }, [open, defaultClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMut = useMutation({
    mutationFn: async () => {
      const clientId = await client.ensureClient();
      if (!clientId) return null;
      // No address field — it's filled in automatically: the opportunity's
      // property address when scheduled from an opportunity, else (or if
      // that's blank) the selected client's address, else left empty.
      const opportunity = defaultOpportunityId
        ? await qc.fetchQuery({ queryKey: ["opportunity", defaultOpportunityId], queryFn: () => getOpportunity(defaultOpportunityId) })
        : null;
      const clientAddress = client.selectedClient?.address ?? client.draft?.address ?? null;
      const address = opportunity?.address?.trim() || clientAddress?.trim() || null;
      return createAppointment({
        client_id: clientId,
        opportunity_id: defaultOpportunityId ?? null,
        type,
        // Start time only — no duration/end (duration keeps its 60-minute
        // default). A cleared time saves a date-only appointment (0092).
        date_time: time ? timedDateTime(date, time) : allDayDateTime(date),
        all_day: !time,
        address,
        notes: notes.trim() || null,
      });
    },
    onSuccess: (appt) => {
      if (!appt) return;
      invalidateAppointmentQueries(qc, defaultClientId, defaultOpportunityId);
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>New appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AppointmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(APPOINTMENT_TYPE_LABEL) as AppointmentType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {APPOINTMENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AppointmentDateTimeFields date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
            {!defaultClientId && (
              <ClientCombobox
                field={client}
                label="Customer"
                onCreateAnyway={() => {
                  client.acceptDuplicate();
                  createMut.mutate();
                }}
              />
            )}
          </div>
          <Button
            className="w-full font-bold"
            disabled={!client.hasClient || !date || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Creating…" : "Create appointment"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Date + start time for the New / Edit appointment dialogs: native pickers
 * (the phone's own date and time wheels), side by side from `sm`, stacked
 * on phones. The time steps in 15 minutes and shows in the device's
 * 12-hour format on US devices; it's optional — leave it blank for a
 * date-only appointment.
 */
function AppointmentDateTimeFields({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="appointment-date">Date</Label>
        <Input id="appointment-date" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="appointment-time">Time</Label>
        <Input id="appointment-time" type="time" step={900} value={time} onChange={(e) => onTimeChange(e.target.value)} className="h-11" />
      </div>
    </div>
  );
}

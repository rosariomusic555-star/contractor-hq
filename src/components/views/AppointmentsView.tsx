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
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import { appointmentStatusMeta } from "@/lib/statusMeta";
import { invalidateAppointmentQueries } from "@/lib/appointmentQueries";
import { allDayDateTime, appointmentDateKey, appointmentTimeLabel, localYmd } from "@/lib/appointmentTime";
import {
  listAppointments,
  createAppointment,
  getOpportunity,
  setAppointmentStatus,
  updateAppointment,
  createQuote,
  APPOINTMENT_TYPE_LABEL,
  listClients,
  type Appointment,
  type AppointmentType,
} from "@/lib/api";

type Filter = "upcoming" | "today" | "past" | "all";

// Local dates, not UTC slices — a UTC slice put evening appointments on the
// next day (and all-day ones must land on the date that was picked).
const todayStr = () => localYmd(new Date());
const dateOf = (a: Appointment) => appointmentDateKey(a);

function bucketAppointment(a: Appointment): Exclude<Filter, "all"> {
  const d = dateOf(a);
  const t = todayStr();
  if (d < t) return "past";
  if (d === t) return "today";
  return "upcoming";
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

  const buckets = {
    upcoming: appointments.filter((a) => bucketAppointment(a) === "upcoming" && a.status === "scheduled"),
    today: appointments.filter((a) => bucketAppointment(a) === "today" && a.status === "scheduled"),
    past: appointments.filter((a) => bucketAppointment(a) === "past" || a.status !== "scheduled"),
  };
  const filtered = filter === "all" ? appointments : buckets[filter];

  const options: FilterOption<Filter>[] = [
    { value: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { value: "today", label: "Today", count: buckets.today.length },
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

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="space-y-2">
        {filtered.length === 0 && !isLoading && (
          <div className="card-surface p-10 text-center text-muted-foreground">Nothing here.</div>
        )}
        {filtered.map((a) => (
          <AppointmentRow key={a.id} appointment={a} showClient />
        ))}
      </div>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function AppointmentRow({
  appointment,
  showClient,
}: {
  appointment: Appointment;
  showClient?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const dt = new Date(appointment.date_time);
  const dateLabel = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = appointmentTimeLabel(appointment);
  const meta = appointmentStatusMeta(appointment.status);
  const overdue = appointment.status === "scheduled" && dateOf(appointment) < todayStr();

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
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{dateLabel} · {timeLabel}</span>
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
                disabled={startEstimateMut.isPending}
                onClick={() => startEstimateMut.mutate()}
              >
                {startEstimateMut.isPending ? "Starting…" : "Start estimate →"}
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
  const [notes, setNotes] = useState(appointment.notes ?? "");

  useEffect(() => {
    if (open) {
      setType(appointment.type);
      setDate(appointmentDateKey(appointment));
      setNotes(appointment.notes ?? "");
    }
    // Reset only when the dialog opens — a background refetch of
    // `appointment` mid-edit must not wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMut = useMutation({
    mutationFn: () => {
      let date_time = allDayDateTime(date);
      if (!appointment.all_day) {
        const old = new Date(appointment.date_time);
        const [y, m, d] = date.split("-").map(Number);
        date_time = new Date(y, m - 1, d, old.getHours(), old.getMinutes()).toISOString();
      }
      return updateAppointment(appointment.id, { type, date_time, notes: notes.trim() || null });
    },
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
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const [type, setType] = useState<AppointmentType>("site_visit");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    if (!open) {
      setType("site_visit");
      setDate("");
      setNotes("");
      setClientId(defaultClientId ?? null);
    }
  }, [open, defaultClientId]);

  const createMut = useMutation({
    mutationFn: async () => {
      // No address field — it's filled in automatically: the opportunity's
      // property address when scheduled from an opportunity, else (or if
      // that's blank) the selected client's address, else left empty.
      const opportunity = defaultOpportunityId
        ? await qc.fetchQuery({ queryKey: ["opportunity", defaultOpportunityId], queryFn: () => getOpportunity(defaultOpportunityId) })
        : null;
      const address = opportunity?.address?.trim() || selectedClient?.address?.trim() || null;
      return createAppointment({
        client_id: clientId!,
        opportunity_id: defaultOpportunityId ?? null,
        type,
        // Date-only (0092): no time or duration is asked for; duration
        // keeps its 60-minute default for anything that needs a length.
        date_time: allDayDateTime(date),
        all_day: true,
        address,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
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
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
            {!defaultClientId && (
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <button
                  type="button"
                  onClick={() => setClientPickerOpen(true)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50"
                >
                  <span className={selectedClient ? "text-foreground" : "text-muted-foreground"}>
                    {selectedClient ? selectedClient.name : "Pick a client"}
                  </span>
                  <span className="text-xs font-semibold text-primary">Change</span>
                </button>
              </div>
            )}
          </div>
          <Button
            className="w-full font-bold"
            disabled={!clientId || !date || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Creating…" : "Create appointment"}
          </Button>
        </DialogContent>
      </Dialog>
      <ClientPickerDialog open={clientPickerOpen} onOpenChange={setClientPickerOpen} onSelect={setClientId} />
    </>
  );
}

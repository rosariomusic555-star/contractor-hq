import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  listAppointments,
  createAppointment,
  setAppointmentStatus,
  createQuote,
  APPOINTMENT_TYPE_LABEL,
  listClients,
  type Appointment,
  type AppointmentType,
} from "@/lib/api";

type Filter = "upcoming" | "today" | "past" | "all";

const todayStr = () => new Date().toISOString().slice(0, 10);
const dateOf = (a: Appointment) => a.date_time.slice(0, 10);

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
  const [completeOpen, setCompleteOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const dt = new Date(appointment.date_time);
  const dateLabel = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const meta = appointmentStatusMeta(appointment.status);
  const overdue = appointment.status === "scheduled" && dateOf(appointment) < todayStr();

  const cancelMut = useMutation({
    mutationFn: () => setAppointmentStatus(appointment, "cancelled"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["client-appointments", appointment.client_id] });
      if (appointment.opportunity_id) qc.invalidateQueries({ queryKey: ["opportunity-appointments", appointment.opportunity_id] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const startEstimateMut = useMutation({
    mutationFn: () => createQuote({ client_id: appointment.client_id, notes: appointment.outcome ?? null }),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-start gap-3 card-surface p-3.5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", overdue ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
        <Calendar className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{APPOINTMENT_TYPE_LABEL[appointment.type]}</span>
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
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setCompleteOpen(true)}>
              <Check className="mr-1 h-3 w-3" />
              Complete
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
        {appointment.status === "completed" && appointment.type === "site_visit" && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 px-2 text-xs font-semibold"
            disabled={startEstimateMut.isPending}
            onClick={() => startEstimateMut.mutate()}
          >
            {startEstimateMut.isPending ? "Starting…" : "Start estimate →"}
          </Button>
        )}
      </div>
      <CompleteAppointmentDialog open={completeOpen} onOpenChange={setCompleteOpen} appointment={appointment} />
    </div>
  );
}

function CompleteAppointmentDialog({
  open,
  onOpenChange,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
}) {
  const [outcome, setOutcome] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) setOutcome("");
  }, [open]);

  const completeMut = useMutation({
    mutationFn: () => setAppointmentStatus(appointment, "completed", outcome.trim() || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["client-appointments", appointment.client_id] });
      if (appointment.opportunity_id) qc.invalidateQueries({ queryKey: ["opportunity-appointments", appointment.opportunity_id] });
      qc.invalidateQueries({ queryKey: ["activities", appointment.client_id] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Complete appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Notes / outcome (optional)</Label>
          <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened? Measurements, next steps…" rows={4} />
        </div>
        <Button className="w-full font-bold" disabled={completeMut.isPending} onClick={() => completeMut.mutate()}>
          {completeMut.isPending ? "Saving…" : "Mark completed"}
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
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    if (!open) {
      setType("site_visit");
      setDate("");
      setTime("");
      setDuration("60");
      setAddress("");
      setNotes("");
      setClientId(defaultClientId ?? null);
    }
  }, [open, defaultClientId]);

  const createMut = useMutation({
    mutationFn: () =>
      createAppointment({
        client_id: clientId!,
        opportunity_id: defaultOpportunityId ?? null,
        type,
        date_time: new Date(`${date}T${time || "09:00"}`).toISOString(),
        duration_minutes: Number(duration) || 60,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      if (defaultClientId) qc.invalidateQueries({ queryKey: ["client-appointments", defaultClientId] });
      if (defaultOpportunityId) qc.invalidateQueries({ queryKey: ["opportunity-appointments", defaultOpportunityId] });
      qc.invalidateQueries({ queryKey: ["activities"] });
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" />
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

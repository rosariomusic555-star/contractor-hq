import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  listAppointments,
  listOpportunities,
  listProjects,
  getBusinessProfile,
  APPOINTMENT_TYPE_LABEL,
  type Appointment,
  type AppointmentType,
} from "@/lib/api";
import { getWeatherStrip } from "@/lib/weather";
import { upcomingAppointmentRows } from "@/lib/upcomingAppointments";
import { AppointmentRow, CreateAppointmentDialog } from "@/components/views/AppointmentsView";

const MAX_ITEMS = 5;

/** On-site appointment types a rain day actually affects — matches the
 * Weather Strip's own "rain stops outdoor work" framing, just applied to
 * appointments instead of material install windows. Phone consultations
 * and office meetings (design/proposal review) aren't weather-sensitive. */
const OUTDOOR_APPOINTMENT_TYPES = new Set<AppointmentType>(["site_visit", "estimate_appointment"]);

/**
 * "Appointments · next 7 days" — same card shell/pairing as
 * MaterialDeliveriesCard (the Dashboard's other "what's coming up" card).
 * Reuses AppointmentsView's own AppointmentRow/CreateAppointmentDialog for
 * the row-click detail view and the empty-state "Schedule one" action
 * rather than building a second appointment UI.
 */
export function UpcomingAppointmentsCard({ className }: { className?: string }) {
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  // Same query key/params WeatherStrip uses, so this is a cache hit, not a
  // second network call, once the Weather Strip above it has loaded.
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const address = profile?.address?.trim() || null;
  const { data: weatherDays } = useQuery({
    queryKey: ["weather-strip", address],
    queryFn: () => getWeatherStrip(address as string),
    enabled: !!address,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const rainDays = new Set((weatherDays ?? []).filter((d) => d.flagReason === "rain").map((d) => d.date));

  const opportunitiesById = new Map(opportunities.map((o) => [o.id, o]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const rows = upcomingAppointmentRows(appointments, opportunitiesById, projectsById);
  const shown = rows.slice(0, MAX_ITEMS);
  const remaining = rows.length - shown.length;

  const [openAppointment, setOpenAppointment] = useState<Appointment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className={cn("card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Appointments <span className="text-muted-foreground">· next 7 days</span>
        </h3>
        <Link to="/appointments" className="text-[13px] font-semibold text-primary hover:text-primary/80">
          View all
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">No appointments in the next 7 days</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-2 text-[13px] font-semibold text-primary hover:text-primary/80"
          >
            Schedule one
          </button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {shown.map((row, i) => {
            const showDayHeader = i === 0 || row.dayKey !== shown[i - 1].dayKey;
            const a = row.appointment;
            const rainFlag = OUTDOOR_APPOINTMENT_TYPES.has(a.type) && rainDays.has(row.dayKey);
            return (
              <li key={a.id}>
                {showDayHeader && (
                  <p className={cn("text-[11px] font-bold uppercase tracking-wide text-muted-subtle", i === 0 ? "pt-1" : "pt-3")}>
                    {row.dayLabel}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setOpenAppointment(a)}
                  className={cn(
                    "-mx-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-muted/50",
                    row.isToday && "bg-primary/5",
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-bold text-foreground">{row.timeLabel}</p>
                      <span className="text-xs text-muted-foreground">· {APPOINTMENT_TYPE_LABEL[a.type]}</span>
                      {rainFlag && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-label="Rain risk" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <Link
                        to={`/clients/${a.client_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-foreground hover:underline"
                      >
                        {a.client?.name ?? "Client"}
                      </Link>
                      {row.projectId && (
                        <>
                          {" · "}
                          <Link
                            to={`/projects/${row.projectId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground hover:underline"
                          >
                            {row.projectName}
                          </Link>
                        </>
                      )}
                    </p>
                    {a.address && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-subtle">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {a.address}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {remaining > 0 && (
        <Link to="/appointments" className="mt-2 block text-[13px] font-semibold text-primary hover:text-primary/80">
          +{remaining} more this week
        </Link>
      )}

      <Dialog open={!!openAppointment} onOpenChange={(open) => !open && setOpenAppointment(null)}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Appointment</DialogTitle>
          </DialogHeader>
          {openAppointment && <AppointmentRow appointment={openAppointment} showClient />}
        </DialogContent>
      </Dialog>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}

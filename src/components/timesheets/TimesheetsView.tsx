import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronRight as Go, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";
import { approveTimesheet, getPayPeriod, getPayrollSettings, listEmployees, listRainDays, listTimesheets, payPeriodFor } from "@/lib/api";
import { TIMESHEET_STATUS, addDaysIso, dayLabel, fmtHours, isoDay, periodTotals, timesheetEntries, timesheetFlags } from "@/lib/timesheets";

const shortRange = (a: string, b: string) => `${dayLabel(a).split(", ").slice(1).join(", ")} – ${dayLabel(b).split(", ").slice(1).join(", ")}`;

/**
 * Timesheets (0131, owner): one row per active employee for the pay
 * period — regular / overtime hours, status, flags — with "Approve all
 * without flags" and the payroll export for the period.
 */
export function TimesheetsView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = isoDay(new Date());
  const [date, setDate] = useState(today);
  const { data: period } = useQuery({ queryKey: ["pay-period", date], queryFn: () => payPeriodFor(date) });
  const start = period?.period_start;
  const end = period?.period_end;
  const { data: sheets = [] } = useQuery({ queryKey: ["timesheets", start], queryFn: () => listTimesheets(start!), enabled: !!start });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { data: rain = [] } = useQuery({ queryKey: ["rain-days", start, end], queryFn: () => listRainDays(start!, end!), enabled: !!start });
  const { data: settings } = useQuery({ queryKey: ["payroll-settings"], queryFn: getPayrollSettings });
  const { data: pp } = useQuery({ queryKey: ["pay-period-row", start], queryFn: () => getPayPeriod(start!), enabled: !!start });

  const rows = useMemo(() => {
    const active = employees.filter((e) => e.status === "active" || sheets.some((s) => s.employee_id === e.id));
    return active.map((emp) => {
      const sheet = sheets.find((s) => s.employee_id === emp.id) ?? null;
      const entries = sheet ? timesheetEntries(sheet) : [];
      const flags = timesheetFlags(entries, { today, longDayHours: settings?.long_day_hours ?? 12, rainDays: rain });
      return { emp, sheet, totals: periodTotals(entries), flags, status: sheet && entries.length ? sheet.status : "not_submitted" };
    });
  }, [employees, sheets, rain, today, settings]);

  const clean = rows.filter((r) => r.sheet && r.status === "submitted" && r.flags.length === 0);
  const approveAll = useMutation({
    mutationFn: async () => {
      for (const r of clean) await approveTimesheet(r.sheet!.id);
      return clean.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      toast({ title: `Approved ${n} timesheet${n === 1 ? "" : "s"}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const allApproved = rows.some((r) => r.totals.total > 0) && rows.every((r) => r.totals.total === 0 || r.status === "approved");

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-4 pb-20">
      <MobilePageHeader title="Timesheets" />
      <div className="hidden md:block">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Timesheets</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Previous period" disabled={!start} onClick={() => start && setDate(addDaysIso(start, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="min-w-[10rem] text-center text-sm font-bold text-foreground">{start && end ? shortRange(start, end) : "…"}</p>
        <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Next period" disabled={!end || end >= today} onClick={() => end && setDate(addDaysIso(end, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {pp?.exported_at && (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-bold text-success">{pp.paid_on ? `Paid ${formatDate(pp.paid_on)}` : "Exported"}</span>
        )}
        <div className="ml-auto flex gap-2">
          {clean.length > 0 && (
            <Button className="h-10" disabled={approveAll.isPending} onClick={() => approveAll.mutate()}>
              Approve {clean.length} without flags
            </Button>
          )}
          {start && (
            <Button asChild variant={allApproved ? "default" : "outline"} className="h-10">
              <Link to={`/timesheets/payroll/${start}`}>
                <Receipt className="mr-1.5 h-4 w-4" /> Payroll
              </Link>
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">
          No employees yet — add crew logins in <Link to="/settings/employees" className="font-semibold text-primary">Settings › Employees</Link>.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ emp, sheet, totals, flags, status }) => {
            const st = TIMESHEET_STATUS[status];
            const body = (
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground">{emp.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{fmtHours(totals.reg)}</span> regular
                    {totals.ot > 0 && (
                      <span className="font-semibold text-warning-strong">
                        {" "}
                        · <span className="tabular-nums">{fmtHours(totals.ot)}</span> OT
                      </span>
                    )}
                  </p>
                </div>
                {flags.length > 0 && (
                  <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", flags.some((f) => f.blocking) ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-strong")}>
                    <AlertTriangle className="h-3 w-3" /> {flags.length}
                  </span>
                )}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", st.tone)}>{st.label}</span>
                {sheet && <Go className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
            return (
              <li key={emp.id} className="card-surface overflow-hidden">
                {sheet ? (
                  <Link to={`/timesheets/${sheet.id}`} className="block hover:bg-muted/30">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

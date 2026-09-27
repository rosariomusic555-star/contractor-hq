import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { getPayPeriod, getPayrollSettings, listTimesheets, markPayPeriod, payPeriodFor } from "@/lib/api";
import { dayLabel, fmtHours, genericPayrollCsv, gustoPayrollCsv, isoDay, payrollRow, r2, type PayrollRow } from "@/lib/timesheets";

const shortRange = (a: string, b: string) => `${dayLabel(a).split(", ").slice(1).join(", ")} – ${dayLabel(b).split(", ").slice(1).join(", ")}`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Payroll for one pay period (0131): per employee regular / overtime hours,
 * rate, and ESTIMATED gross (hours × rate, overtime × multiplier — no
 * taxes or deductions; the payroll provider does that). Exports a generic
 * CSV and a Gusto-style CSV, and marks the period Exported / Paid (which
 * locks it; unlocking is logged).
 */
export function PayrollView() {
  const { start = "" } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: period } = useQuery({ queryKey: ["pay-period", start], queryFn: () => payPeriodFor(start) });
  const { data: sheets = [] } = useQuery({ queryKey: ["timesheets", start], queryFn: () => listTimesheets(start) });
  const { data: settings } = useQuery({ queryKey: ["payroll-settings"], queryFn: getPayrollSettings });
  const { data: pp } = useQuery({ queryKey: ["pay-period-row", start], queryFn: () => getPayPeriod(start) });
  const [paidOn, setPaidOn] = useState(isoDay(new Date()));
  const end = period?.period_end ?? start;

  const withHours = sheets.filter((s) => (s.entries ?? []).some((e) => Number(e.hours) > 0));
  const notApproved = withHours.filter((s) => s.status !== "approved");
  const rows: PayrollRow[] = withHours
    .map((s) =>
      payrollRow(
        s.employee_id,
        s.employee?.name ?? "Employee",
        (s.entries ?? []).map((e) => ({ entry_date: e.entry_date, hours: Number(e.hours), reg_hours: e.reg_hours ?? null, ot_hours: e.ot_hours ?? null, hourly_rate: e.hourly_rate })),
        settings?.ot_multiplier ?? 1.5,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = { reg: r2(rows.reduce((s, r) => s + r.reg, 0)), ot: r2(rows.reduce((s, r) => s + r.ot, 0)), gross: r2(rows.reduce((s, r) => s + r.gross, 0)) };
  const ready = rows.length > 0 && notApproved.length === 0 && !rows.some((r) => r.missingRate);

  const mark = useMutation({
    mutationFn: (m: "exported" | "paid" | "unlock") => markPayPeriod(start, m !== "unlock", m === "paid" ? paidOn : null),
    onSuccess: (_d, m) => {
      qc.invalidateQueries({ queryKey: ["pay-period-row", start] });
      qc.invalidateQueries({ queryKey: ["timesheets"] });
      toast({ title: m === "unlock" ? "Pay period unlocked" : m === "paid" ? "Marked paid" : "Marked exported" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const file = (kind: string) => `payroll-${kind}-${start}-to-${end}.csv`;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-4 pb-20">
      <MobilePageHeader title="Payroll" back={{ to: "/timesheets", label: "Timesheets" }} />
      <div className="hidden md:block">
        <BackLink to="/timesheets" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Timesheets
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Payroll · {start && shortRange(start, end)}</h1>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        Estimated gross pay only — hours × rate, overtime × {settings?.ot_multiplier ?? 1.5}. No taxes or deductions; your payroll provider calculates those.
      </p>

      {notApproved.length > 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          {notApproved.length} timesheet{notApproved.length === 1 ? " isn't" : "s aren't"} approved yet ({notApproved.map((s) => s.employee?.name).join(", ")}).{" "}
          <Link to="/timesheets" className="font-semibold text-primary">
            Review
          </Link>
        </p>
      )}

      <div className="card-surface overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No hours in this period.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <li key={r.employeeId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtHours(r.reg)} regular{r.ot > 0 ? ` · ${fmtHours(r.ot)} OT` : ""} · {r.rates.length ? r.rates.map((x) => `$${x}`).join(" → ") + "/h" : "no rate"}
                  </p>
                </div>
                <p className={cn("font-bold tabular-nums", r.missingRate ? "text-destructive" : "text-foreground")}>{r.missingRate ? "Rate missing" : formatCurrency(r.gross)}</p>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-muted/40 px-4 py-3 font-bold">
              <span className="flex-1">
                Total · {fmtHours(total.reg)} reg{total.ot > 0 ? ` · ${fmtHours(total.ot)} OT` : ""}
              </span>
              <span className="tabular-nums">{formatCurrency(total.gross)}</span>
            </li>
          </ul>
        )}
      </div>

      {rows.length > 0 && (
        <section className="card-surface space-y-3 p-4">
          <h3 className="text-sm font-bold text-foreground">Export</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" disabled={!ready} onClick={() => download(file("generic"), genericPayrollCsv(rows, { start, end }))}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" className="h-11" disabled={!ready} onClick={() => download(file("gusto"), gustoPayrollCsv(rows))}>
              <Download className="mr-1.5 h-4 w-4" /> Gusto CSV
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The Gusto file uses first name, last name, regular and overtime hours — check it against Gusto's own hours-import template before your first payroll run.
            {!ready && " Exports unlock once every timesheet with hours is approved and has a pay rate."}
          </p>

          <div className="border-t border-hairline pt-3">
            {pp?.exported_at ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-bold text-success">
                  {pp.paid_on ? `Paid ${pp.paid_on}` : `Exported ${new Date(pp.exported_at).toLocaleDateString()}`} · locked
                </span>
                {!pp.paid_on && (
                  <>
                    <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-10 w-40" />
                    <Button className="h-10" disabled={mark.isPending} onClick={() => mark.mutate("paid")}>
                      Mark paid
                    </Button>
                  </>
                )}
                <Button variant="ghost" className="h-10 text-muted-foreground" disabled={mark.isPending} onClick={() => mark.mutate("unlock")}>
                  Unlock period
                </Button>
              </div>
            ) : (
              <Button className="h-11" disabled={!ready || mark.isPending} onClick={() => mark.mutate("exported")}>
                Mark exported (locks the period)
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

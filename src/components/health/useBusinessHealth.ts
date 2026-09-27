import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBusinessHealthSettings,
  getMarketingSettings,
  getOverheadSettings,
  listAllMaterialsSections,
  listChangeOrders,
  listCloseouts,
  listCrewsWithWorkDays,
  listExpenses,
  listHolidays,
  listInvoices,
  listLaborEntriesSince,
  listLeadSourceSpend,
  listLeadSources,
  listMaterialsSheets,
  listOpportunities,
  listPayments,
  listProjects,
  listQuotes,
  listScheduleDelays,
  pickHeadlineQuote,
  quoteTotal,
  type ChangeOrder,
  type MaterialsSection,
  type Payment,
  type Quote,
} from "@/lib/api";
import { avgMargin, buildProjectFinancials, withinRange, type DateRange } from "@/lib/financials";
import { OVERHEAD_SETTINGS_DEFAULTS, annualOverhead, burdenPerHour, crewDayHours, plannedManHours } from "@/lib/overhead";
import { invoiceBalance, isActivePayment, paymentUnallocated } from "@/lib/projectMoney";
import { buildRoiRows, resolvePeriod } from "@/lib/marketingRoi";
import {
  addDays,
  agingDetail,
  cashForecast,
  crewCapacity,
  isBookedStatus,
  iso,
  monthCompare,
  plannedCrewDays,
  unscheduledBacklog,
  winStats,
  workingDaysBetween,
  MON_FRI,
  type FInvoice,
  type HProject,
} from "@/lib/businessHealth";

function groupBy<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/**
 * Everything the Business health page shows, from live data through the
 * app's own helpers (contract value, invoice balance, margins, overhead,
 * marketing ROI) so the numbers match every other page.
 */
export function useBusinessHealth(profitRange: DateRange) {
  const q = <T,>(key: unknown[], fn: () => Promise<T>) => useQuery({ queryKey: key, queryFn: fn, staleTime: 60_000 }); // eslint-disable-line react-hooks/rules-of-hooks
  const { data: projects = [], isLoading } = q(["projects"], () => listProjects());
  const { data: quotes = [] } = q(["quotes"], () => listQuotes());
  const { data: changeOrders = [] } = q(["change-orders"], () => listChangeOrders());
  const { data: invoices = [] } = q(["invoices"], () => listInvoices());
  const { data: payments = [] } = q(["payments"], () => listPayments());
  const { data: sheets = [] } = q(["materials-sheets"], () => listMaterialsSheets());
  const { data: sections = [] } = q(["materials-sections-all"], listAllMaterialsSections);
  const { data: expenses = [] } = q(["expenses"], () => listExpenses());
  const { data: crews = [] } = q(["crews-work-days"], listCrewsWithWorkDays);
  const { data: holidays = [] } = q(["holidays"], listHolidays);
  const { data: settings } = q(["business-health-settings"], getBusinessHealthSettings);
  const { data: overhead } = q(["overhead-settings"], getOverheadSettings);
  const { data: opportunities = [] } = q(["opportunities"], listOpportunities);
  const { data: delays = [] } = q(["schedule-delays", "all"], () => listScheduleDelays());
  const { data: closeouts = [] } = q(["closeouts"], listCloseouts);
  const { data: spend = [] } = q(["lead-source-spend"], listLeadSourceSpend);
  const { data: leadSources = [] } = q(["lead-sources"], listLeadSources);
  const { data: roiThresholds } = q(["marketing-settings"], getMarketingSettings);
  const today = iso(new Date());
  const { data: recentLabor = [] } = q(["labor-since", addDays(today, -28)], () => listLaborEntriesSince(addDays(today, -28)));

  return useMemo(() => {
    const holidaySet = new Set(holidays.map((h) => h.date));
    const quotesBy = groupBy<Quote>(quotes, (x) => x.project_id);
    const cosBy = groupBy<ChangeOrder>(changeOrders, (x) => x.project_id);
    const sectionsBy = groupBy<MaterialsSection>(sections, (x) => x.project_id);
    const financials = buildProjectFinancials(
      projects,
      quotesBy,
      cosBy,
      groupBy<Payment>(payments, (x) => x.project_id),
      sheets,
      sections,
      groupBy(expenses as { amount: number; project_id: string }[], (x) => x.project_id),
      [],
    );
    const finBy = new Map(financials.map((f) => [f.project.id, f]));
    const contractOf = (id: string) => finBy.get(id)?.contractValue ?? 0;
    const cdh = crewDayHours(overhead ?? OVERHEAD_SETTINGS_DEFAULTS);

    // --- Backlog + capacity ------------------------------------------------
    const hProjects: HProject[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      crew_id: (p as { crew_id?: string | null }).crew_id ?? null,
      scheduled_start_date: p.scheduled_start_date ?? null,
      scheduled_end_date: p.scheduled_end_date ?? null,
      client_name: p.client?.name ?? null,
    }));
    const capacity = crewCapacity(crews, hProjects, today, holidaySet);
    const booked = projects.filter((p) => isBookedStatus(p.status));
    const unscheduledInput = booked
      .filter((p) => !p.scheduled_start_date)
      .map((p) => ({
        project: hProjects.find((h) => h.id === p.id)!,
        crewDays: plannedCrewDays((p as { estimated_duration_days?: number | null }).estimated_duration_days, plannedManHours(sectionsBy.get(p.id) ?? []), cdh),
        contract: contractOf(p.id),
      }));
    const unscheduled = unscheduledBacklog(unscheduledInput, capacity, today, holidaySet);
    const scheduledFutureDays =
      capacity.reduce((s, c) => s + c.windows[2].booked, 0) +
      // Scheduled jobs with no crew still take crew-days.
      booked
        .filter((p) => p.scheduled_start_date && !crews.some((c) => c.id === (p as { crew_id?: string | null }).crew_id))
        .reduce((s, p) => {
          const end = p.scheduled_end_date ?? p.scheduled_start_date!;
          return end < today ? s : s + workingDaysBetween(p.scheduled_start_date! < today ? today : p.scheduled_start_date!, end, MON_FRI, holidaySet);
        }, 0);
    const unscheduledDays = unscheduled.reduce((s, u) => s + (u.crewDays ?? 0), 0);
    const bookedThrough =
      [...capacity.map((c) => c.bookedThrough), ...booked.map((p) => p.scheduled_end_date ?? p.scheduled_start_date)]
        .filter((d): d is string => !!d && d >= today)
        .sort()
        .pop() ?? null;
    const backlogDollars = booked.reduce((s, p) => s + contractOf(p.id), 0);
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const rain = delays.filter((d) => d.reason === "rain" && !d.undone_at);
    const rainStats = {
      monthCount: rain.filter((d) => d.delay_date.startsWith(today.slice(0, 7))).length,
      monthDays: rain.filter((d) => d.delay_date.startsWith(today.slice(0, 7))).reduce((s, d) => s + d.days, 0),
      yearCount: rain.filter((d) => d.delay_date >= yearStart).length,
      yearDays: rain.filter((d) => d.delay_date >= yearStart).reduce((s, d) => s + d.days, 0),
    };

    // --- Cash ----------------------------------------------------------------
    const invoicedBy = new Map<string, number>();
    for (const inv of invoices) if (inv.project_id) invoicedBy.set(inv.project_id, (invoicedBy.get(inv.project_id) ?? 0) + Number(inv.amount));
    const fInvoices: (FInvoice & { client: string | null; project: string | null; number: string | null })[] = invoices.map((inv) => ({
      id: inv.id,
      status: inv.status,
      amount: Number(inv.amount),
      balance: invoiceBalance(inv),
      due_date: inv.due_date,
      created_at: inv.created_at,
      project_id: inv.project_id,
      client: inv.project?.client?.name ?? null,
      project: inv.project?.name ?? null,
      number: (inv as { invoice_number?: string | null }).invoice_number ?? null,
    }));
    const approvedLabor = recentLabor.filter((e) => e.employee_id && e.timesheet_id);
    const weeklyPayroll = approvedLabor.reduce((s, e) => s + Number(e.cost), 0) / 4;
    const monthlyOverhead = overhead ? annualOverhead(overhead) / 12 : 0;
    const credits = payments.filter(isActivePayment).reduce((s, p) => s + paymentUnallocated(p), 0);
    const cash = cashForecast({
      today,
      invoices: fInvoices,
      jobs: booked.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        start: p.scheduled_start_date ?? null,
        end: p.scheduled_end_date ?? null,
        contract: contractOf(p.id),
        invoiced: invoicedBy.get(p.id) ?? 0,
        depositPct: pickHeadlineQuote(quotesBy.get(p.id) ?? [])?.deposit_percentage ?? 0,
      })),
      dueDays: settings?.invoice_due_days ?? 14,
      credits,
      weeklyPayroll,
      monthlyOverhead,
    });

    // --- Receivables --------------------------------------------------------
    const aging = agingDetail(fInvoices, today);
    const overdueByClient = new Map<string, number>();
    for (const b of aging.slice(1)) for (const x of b.items) overdueByClient.set(x.inv.client ?? "No client", (overdueByClient.get(x.inv.client ?? "No client") ?? 0) + x.inv.balance);
    const topOverdue = [...overdueByClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const overdueAR = aging.slice(1).reduce((s, b) => s + b.amount, 0);

    // --- Trends -------------------------------------------------------------
    const bookedItems = [
      ...quotes
        .filter((x) => x.status === "approved" && x.project_id && projects.some((p) => p.id === x.project_id))
        .map((x) => ({ date: (x.signed_at ?? x.updated_at).slice(0, 10), amount: quoteTotal(x.quote_sections) })),
      ...changeOrders.filter((c) => c.status === "approved" && c.approved_at).map((c) => ({ date: c.approved_at!.slice(0, 10), amount: Number(c.amount) })),
    ];
    const bookedCompare = monthCompare(bookedItems, today);
    const collectedCompare = monthCompare(
      payments.filter(isActivePayment).map((p) => ({ date: p.paid_on, amount: Number(p.amount) })),
      today,
    );
    const probs = settings?.stage_probabilities ?? {};
    const headlineValue = (projectId: string | null) => {
      if (!projectId) return 0;
      const h = pickHeadlineQuote(quotesBy.get(projectId) ?? []);
      return h ? quoteTotal(h.quote_sections) : 0;
    };
    const openOpps = opportunities.filter((o) => o.stage !== "won" && o.stage !== "lost");
    const pipelineStages = Object.keys(probs).map((stage) => {
      const list = openOpps.filter((o) => o.stage === stage);
      const value = list.reduce((s, o) => s + headlineValue(o.project_id), 0);
      return { stage, count: list.length, value, probability: probs[stage] ?? 0, weighted: (value * (probs[stage] ?? 0)) / 100 };
    });
    const decisions = opportunities
      .filter((o) => o.stage === "won" || o.stage === "lost")
      .map((o) => {
        if (o.stage === "lost") return { outcome: "lost" as const, date: o.updated_at.slice(0, 10), value: 0 };
        const signed = (quotesBy.get(o.project_id ?? "") ?? []).filter((x) => x.status === "approved" && x.kind !== "addon").map((x) => x.signed_at ?? x.updated_at).sort()[0];
        return { outcome: "won" as const, date: (signed ?? o.updated_at).slice(0, 10), value: contractOf(o.project_id ?? "") };
      });
    const win90 = winStats(decisions, addDays(today, -89), today);
    const winPrior = winStats(decisions, addDays(today, -179), addDays(today, -90));

    // --- Profitability (completed jobs in the chosen period) ----------------
    const rate = burdenPerHour(overhead ?? null);
    const completed = financials.filter((f) => f.project.status === "complete" && withinRange((f.project.completed_at ?? f.jobDate) as string, profitRange));
    const withLoaded = completed.map((f) => {
      const r = f.project.overhead_rate ?? rate;
      const loaded = f.profit != null && r != null ? f.profit - plannedManHours(sectionsBy.get(f.project.id) ?? []) * r : null;
      return { f, loaded, loadedPct: loaded != null && f.contractValue > 0 ? Math.round((loaded / f.contractValue) * 100) : null };
    });
    const margins = avgMargin(completed);
    const loadedRows = withLoaded.filter((x) => x.loadedPct != null);
    const ranked = [...completed].filter((f) => f.marginPct != null).sort((a, b) => b.marginPct! - a.marginPct!);
    const closeoutRows = closeouts.filter((c) => !c.superseded_at && !c.excluded && withinRange(c.completed_on, profitRange));
    const plannedVsActual = {
      count: closeoutRows.length,
      expected: closeoutRows.reduce((s, c) => s + (c.snapshot?.report?.profit?.expected ?? 0), 0),
      actual: closeoutRows.reduce((s, c) => s + (c.snapshot?.report?.profit?.actual ?? 0), 0),
    };
    const ytd = resolvePeriod("ytd", null);
    const roi = buildRoiRows({
      leads: opportunities,
      spend,
      sources: leadSources.map((s) => ({ name: s.name, paid: s.paid ?? true })),
      period: ytd,
      openValue: () => 0,
      wonMoney: (pid) => ({ revenue: contractOf(pid), grossProfit: finBy.get(pid)?.profit ?? null, loadedProfit: null }),
      hasOverhead: false,
    }).totals;

    return {
      contractOf,
      today,
      holidays,
      crews,
      capacity,
      unscheduled,
      bookedThrough,
      backlogDollars,
      backlogCrewWeeks: Math.round(((scheduledFutureDays + unscheduledDays) / 5) * 10) / 10,
      rainStats,
      cash,
      weeklyPayroll,
      monthlyOverhead,
      credits,
      aging,
      overdueAR,
      topOverdue,
      bookedCompare,
      collectedCompare,
      pipelineStages,
      win90,
      winPrior,
      profit: {
        jobs: withLoaded,
        avgPct: margins.avgPct,
        avgLoadedPct: loadedRows.length ? Math.round(loadedRows.reduce((s, x) => s + x.loadedPct!, 0) / loadedRows.length) : null,
        hasOverhead: rate != null,
        best: ranked[0] ?? null,
        worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
        total: completed.reduce((s, f) => s + (f.profit ?? 0), 0),
        excluded: margins.excludedCount,
      },
      plannedVsActual,
      roi,
      roiThresholds,
      isLoading,
    };
  }, [projects, quotes, changeOrders, invoices, payments, sheets, sections, expenses, crews, holidays, settings, overhead, opportunities, delays, closeouts, spend, leadSources, roiThresholds, recentLabor, today, profitRange, isLoading]);
}

export type BusinessHealth = ReturnType<typeof useBusinessHealth>;

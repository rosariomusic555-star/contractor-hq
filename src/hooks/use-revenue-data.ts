import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getOverheadSettings,
  listAllMaterialsSections,
  listAllProjectFeatures,
  listAllUsageLogs,
  listCategories,
  listChangeOrders,
  listClients,
  listCloseouts,
  listCrews,
  listExpenseCategories,
  listExpenses,
  listInvoices,
  listLaborEntriesSince,
  listLeadSourceSpend,
  listMaterialOrders,
  listOpportunities,
  listPayments,
  listProjects,
  listQuotes,
} from "@/lib/api";
import { burdenPerHour } from "@/lib/overhead";
import { completedJobs, makeJobProfit, profitTotals, resolvePeriod, type JobProfit, type PeriodKey, type ProfitInputs } from "@/lib/revenueReport";

/**
 * Every row the revenue report reads, across all jobs — the same query keys
 * the rest of the app uses (projects, quotes, invoices, payments, …), so
 * the Revenue page, Business health and the Dashboard share one cache.
 * `ready` once the core money rows are in.
 */
export function useRevenueData() {
  // A named hook so the rules of hooks hold (called unconditionally, in order).
  const useQ = <T,>(key: unknown[], fn: () => Promise<T>) => useQuery({ queryKey: key, queryFn: fn, staleTime: 60_000 });
  const projects = useQ(["projects"], () => listProjects());
  const quotes = useQ(["quotes"], () => listQuotes());
  const changeOrders = useQ(["change-orders"], () => listChangeOrders());
  const invoices = useQ(["invoices"], () => listInvoices());
  const payments = useQ(["payments"], () => listPayments());
  const clients = useQ(["clients"], listClients);
  const opportunities = useQ(["opportunities"], listOpportunities);
  const crews = useQ(["crews"], listCrews);
  const spend = useQ(["lead-source-spend"], listLeadSourceSpend);
  const sections = useQ(["materials-sections-all"], listAllMaterialsSections);
  const expenses = useQ(["expenses"], () => listExpenses());
  const expenseCategories = useQ(["expense-categories"], listExpenseCategories);
  const labor = useQ(["labor-entries", "all"], () => listLaborEntriesSince("1900-01-01"));
  const materialOrders = useQ(["material-orders"], () => listMaterialOrders());
  const usageLogs = useQ(["materials-usage-logs", "all"], listAllUsageLogs);
  const features = useQ(["project-features", "all"], listAllProjectFeatures);
  const categories = useQ(["categories"], listCategories);
  const closeouts = useQ(["all-closeouts"], listCloseouts);
  const overhead = useQ(["overhead-settings"], getOverheadSettings);

  const ready = [projects, quotes, changeOrders, invoices, payments].every((x) => x.isSuccess);
  const d = [projects, quotes, changeOrders, invoices, payments, clients, opportunities, crews, spend, sections, expenses, expenseCategories, labor, materialOrders, usageLogs, features, categories, closeouts, overhead].map((x) => x.data);
  // One stable object per data change — the report is heavy, so consumers
  // memoize on this and must not recompute every render.
  return useMemo(() => {
    const profitInputs: ProfitInputs = {
      projects: projects.data ?? [],
      quotes: quotes.data ?? [],
      changeOrders: changeOrders.data ?? [],
      sections: sections.data ?? [],
      expenses: expenses.data ?? [],
      expenseCategories: expenseCategories.data ?? [],
      laborEntries: labor.data ?? [],
      materialOrders: materialOrders.data ?? [],
      usageLogs: usageLogs.data ?? [],
      features: features.data ?? [],
      categories: categories.data ?? [],
      closeouts: closeouts.data ?? [],
      burden: burdenPerHour(overhead.data ?? null),
    };
    return {
      ready,
      profitInputs,
      invoices: invoices.data ?? [],
      payments: payments.data ?? [],
      clients: clients.data ?? [],
      opportunities: opportunities.data ?? [],
      crews: crews.data ?? [],
      spend: spend.data ?? [],
      categories: categories.data ?? [],
      hasOverhead: !!overhead.data && burdenPerHour(overhead.data) != null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...d]);
}

/** Completed-job profit for a period — the same numbers as the Revenue
 * report's Gross profit (closeout, else live Planned vs actual; margin
 * dollar-weighted). For Business health / the Dashboard. */
export function useCompletedProfit(periodKey: PeriodKey) {
  const data = useRevenueData();
  return useMemo(() => {
    const period = resolvePeriod(periodKey);
    if (!data.ready) return { ready: false as const, period, jobs: [] as JobProfit[], totals: profitTotals([]), names: new Map<string, string>() };
    const jp = makeJobProfit(data.profitInputs);
    const jobs = completedJobs(data.profitInputs.projects, jp, period);
    return { ready: true as const, period, jobs, totals: profitTotals(jobs), names: new Map(data.profitInputs.projects.map((p) => [p.id, p.name])) };
  }, [data, periodKey]);
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { FilterSegment, FilterPills, type FilterOption } from "@/components/common/FilterControls";
import { ListCard } from "@/components/common/ListCard";
import { StatusPill } from "@/components/common/StatusPill";
import { CategoryChips } from "@/components/common/CategoryChips";
import { formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listChangeOrders,
  listCategories,
  projectContractValue,
  projectCategoryIds,
  type ProjectStatus,
} from "@/lib/api";
import { PROJECT_STATUSES, projectStatusMeta, VISUAL_STATUS_META } from "@/lib/statusMeta";
import { isExcludedFromFinancials } from "@/lib/financials";
import { demoJobMeta, DEMO_WEEKS_BOOKED } from "@/lib/demoData";

type Filter = "all" | ProjectStatus;

export function ProjectsView() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: projects = [], isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  /** Real contract value per project = its headline quote's total, plus its approved change orders. */
  const contractOf = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const p of projects) {
      const mine = quotes.filter((q) => q.project_id === p.id);
      const myChangeOrders = changeOrders.filter((co) => co.project_id === p.id);
      byProject.set(p.id, projectContractValue(mine, myChangeOrders));
    }
    return byProject;
  }, [projects, quotes, changeOrders]);

  // "All" means real jobs only — Scheduled/In progress/Complete. Estimating
  // (still being sold, not a confirmed job yet) and Lost each get their own
  // tab instead of diluting the default view — see the pipeline restructure.
  // Same exclusion financials.ts applies to every revenue/financial total.
  const isRealJob = (p: (typeof projects)[number]) => !isExcludedFromFinancials(p.status);
  const underContract = projects
    .filter(isRealJob)
    .reduce((a, p) => a + (contractOf.get(p.id) ?? 0), 0);
  const countByStatus = (s: ProjectStatus) => projects.filter((p) => p.status === s).length;

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: projects.filter(isRealJob).length },
    ...PROJECT_STATUSES.filter((s) => s !== "lost").map((s) => ({
      value: s as Filter,
      label: projectStatusMeta(s).label,
      count: countByStatus(s),
    })),
    { value: "lost" as Filter, label: "Archived", count: countByStatus("lost") },
  ];

  const filtered = projects.filter((p) => {
    if (filter === "all" ? !isRealJob(p) : p.status !== filter) return false;
    if (typeFilter && !projectCategoryIds(p).includes(typeFilter)) return false;
    const term = search.toLowerCase();
    return !term || p.name.toLowerCase().includes(term) || (p.client?.name ?? "").toLowerCase().includes(term);
  });

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader
        title="Projects"
        subtitle={`${pluralize(projects.length, "project")} · ${formatCurrency(underContract)} under contract`}
        actions={
          <button
            onClick={() => navigate("/projects/new")}
            className="h-8 rounded-[0.625rem] bg-sidebar-primary px-3 text-[13px] font-bold text-sidebar-primary-foreground"
          >
            + New
          </button>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects or clients"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Projects"
        subtitle={`${pluralize(projects.length, "project")} · ${formatCurrency(underContract)} under contract · ${DEMO_WEEKS_BOOKED} weeks booked out`}
        actions={
          <Button onClick={() => navigate("/projects/new")} className="font-bold">
            + New project
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSegment className="hidden md:inline-flex" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <FilterPills className="md:hidden" options={options} value={filter} onChange={(v) => setFilter(v)} />
        <Select value={typeFilter ?? "all"} onValueChange={(v) => setTypeFilter(v === "all" ? null : v)}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search projects or clients" className="hidden md:flex md:max-w-xs" />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading projects…</p>}
      {isError && <p className="text-destructive">Failed to load projects: {(error as Error).message}</p>}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          No projects yet. Create your first project to get started.
        </div>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Contract</th>
                    <th>Stage</th>
                    <th>Progress</th>
                    <th>Next</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const contract = contractOf.get(p.id) ?? 0;
                    const demo = demoJobMeta(p);
                    return (
                      <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                        <td>
                          <div className="font-bold text-foreground">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {projectStatusMeta(p.status).label}
                          </div>
                          <CategoryChips categoryIds={projectCategoryIds(p)} className="mt-1" max={3} />
                        </td>
                        <td className="text-muted-foreground">{p.client?.name ?? "No client"}</td>
                        <td className="font-bold tabular-nums">{contract > 0 ? formatCurrency(contract) : "—"}</td>
                        <td><StatusPill meta={VISUAL_STATUS_META[demo.stage]} /></td>
                        <td className="min-w-[140px]">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${demo.progressPct}%` }} />
                          </div>
                          <div className="mt-1 text-[11px] font-semibold text-muted-subtle">
                            {demo.dayOfTotal ? `Day ${demo.dayOfTotal.day} of ${demo.dayOfTotal.total} · ${demo.crew}` : demo.crew}
                          </div>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{demo.nextAction}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No projects here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((p) => {
              const contract = contractOf.get(p.id) ?? 0;
              const demo = demoJobMeta(p);
              const meta = VISUAL_STATUS_META[demo.stage];
              return (
                <ListCard
                  key={p.id}
                  to={`/projects/${p.id}`}
                  borderColor={meta.border}
                  eyebrow={meta.label}
                  eyebrowColor={meta.border}
                  eyebrowRight={contract > 0 ? formatCurrency(contract) : ""}
                  title={p.name}
                  subtitle={`${p.client?.name ?? "No client"} · ${demo.crew}`}
                >
                  <CategoryChips categoryIds={projectCategoryIds(p)} className="mt-1.5" max={3} />
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${demo.progressPct}%` }} />
                  </div>
                </ListCard>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No projects here.</p>}
          </div>
        </>
      )}

    </div>
  );
}

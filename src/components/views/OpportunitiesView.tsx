import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, CalendarClock, ListChecks, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { FilterSegment, FilterPills, type FilterOption } from "@/components/common/FilterControls";
import { ListCard } from "@/components/common/ListCard";
import { StatusPill } from "@/components/common/StatusPill";
import { CategoryChips } from "@/components/common/CategoryChips";
import { SortableTh } from "@/components/common/SortableTh";
import { CreateOpportunityDialog } from "@/components/common/CreateOpportunityDialog";
import { DeleteOpportunitiesDialog } from "@/components/opportunities/DeleteOpportunitiesDialog";
import { useSort } from "@/hooks/use-sort";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { OPPORTUNITY_STAGES, opportunityStageMeta } from "@/lib/statusMeta";
import { EMPTY_FILTERS, filterOpportunityRows, nextUpFor, type NextUp, type OpportunityFilters, type OpportunityRow } from "@/lib/opportunityList";
import {
  listAppointments,
  listArchivedOpportunities,
  listCategories,
  listOpportunities,
  listOpportunityLastActivity,
  listQuotes,
  listTasks,
  opportunityCategoryIds,
  pickHeadlineQuote,
  quoteTotal,
  restoreOpportunity,
  type Quote,
} from "@/lib/api";

type View = "active" | "archived";
const VIEW_OPTIONS: FilterOption<View>[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function NextCell({ next }: { next: NextUp | null }) {
  if (!next) return <span className="text-muted-subtle">—</span>;
  const Icon = next.kind === "appointment" ? CalendarClock : ListChecks;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", next.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{next.label}</span>
      {next.at && <span className="shrink-0">· {next.overdue ? "overdue" : shortDate(next.at)}</span>}
    </span>
  );
}

/**
 * Every opportunity as a sortable, filterable list (the Kanban board stays
 * at /pipeline). Value = the project's headline quote total, same as the
 * board. Archived (0155) opportunities live behind the Archived view and
 * can be restored there; delete / archive in bulk goes through the same
 * checked dialog as the opportunity page.
 */
export function OpportunitiesView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<View>("active");
  const [filters, setFilters] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const set = (patch: Partial<OpportunityFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: active = [], isLoading } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: archived = [] } = useQuery({ queryKey: ["opportunities-archived"], queryFn: listArchivedOpportunities });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const { data: lastActivity = new Map<string, string>() } = useQuery({ queryKey: ["opportunity-last-activity"], queryFn: listOpportunityLastActivity });

  const valueByProject = useMemo(() => {
    const byProject = new Map<string, Quote[]>();
    for (const q of quotes) if (q.project_id) byProject.set(q.project_id, [...(byProject.get(q.project_id) ?? []), q]);
    const values = new Map<string, number>();
    for (const [pid, list] of byProject) {
      const headline = pickHeadlineQuote(list);
      if (headline) values.set(pid, quoteTotal(headline.quote_sections));
    }
    return values;
  }, [quotes]);

  const source = view === "archived" ? archived : active;
  const rows: OpportunityRow[] = useMemo(
    () =>
      source.map((opp) => {
        const last = lastActivity.get(opp.id);
        return {
          opp,
          categoryIds: opportunityCategoryIds(opp),
          value: opp.project_id ? valueByProject.get(opp.project_id) ?? null : null,
          lastActivity: last && last > opp.updated_at ? last : opp.updated_at,
          next: nextUpFor(opp.id, appointments, tasks),
        };
      }),
    [source, lastActivity, valueByProject, appointments, tasks],
  );
  // The Archived view shows everything archived — the stage toggle is for live work.
  const filtered = filterOpportunityRows(rows, view === "archived" ? { ...filters, includeClosed: true } : filters);

  const stageOrder = new Map(OPPORTUNITY_STAGES.map((s, i) => [s, i]));
  const { sorted, sortKey, dir, toggle } = useSort(
    filtered,
    {
      title: (r) => r.opp.title.toLowerCase(),
      client: (r) => (r.opp.client?.name ?? "").toLowerCase(),
      stage: (r) => stageOrder.get(r.opp.stage) ?? 99,
      source: (r) => (r.opp.lead_source ?? "").toLowerCase(),
      value: (r) => r.value ?? -1,
      created: (r) => r.opp.created_at,
      activity: (r) => r.lastActivity,
      next: (r) => r.next?.at || "9999",
    },
    "activity",
  );

  const leadSources = useMemo(
    () => [...new Set([...active, ...archived].map((o) => o.lead_source).filter((s): s is string => !!s))].sort(),
    [active, archived],
  );
  const selectedOpps = source.filter((o) => selected.has(o.id));
  const allShownSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.opp.id));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(sorted.map((r) => r.opp.id)));
  const switchView = (v: View) => {
    setView(v);
    setSelected(new Set());
  };

  const restoreMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await restoreOpportunity(id);
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunities-archived"] });
      setSelected(new Set());
      toast({ title: `${pluralize(ids.length, "opportunity", "opportunities")} restored` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const hasFilters =
    !!filters.search || !!filters.stage || !!filters.leadSource || !!filters.categoryId || !!filters.from || !!filters.to;
  const th = (key: string, label: string, text = false, className?: string) => (
    <SortableTh label={label} active={sortKey === key} dir={dir} onClick={() => toggle(key, text)} className={className} />
  );

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title="Opportunities"
        subtitle={`${pluralize(filtered.length, "opportunity", "opportunities")}`}
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold text-sidebar-foreground">
            + New
          </button>
        }
      >
        <SearchInput
          value={filters.search}
          onChange={(v) => set({ search: v })}
          placeholder="Search title or client"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Opportunities"
        subtitle={`${pluralize(filtered.length, "opportunity", "opportunities")}${view === "archived" ? " archived" : ""}`}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="font-bold">
            + New opportunity
          </Button>
        }
      />

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSegment className="hidden md:inline-flex" options={VIEW_OPTIONS} value={view} onChange={switchView} />
          <FilterPills className="md:hidden" options={VIEW_OPTIONS} value={view} onChange={switchView} />
          <SearchInput
            value={filters.search}
            onChange={(v) => set({ search: v })}
            placeholder="Search title or client"
            className="hidden md:flex md:max-w-xs"
          />
          {view === "active" && (
            <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground md:ml-auto">
              <Switch checked={filters.includeClosed} onCheckedChange={(v) => set({ includeClosed: v })} />
              Include Won / Lost
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end md:gap-3">
          <Select value={filters.stage ?? "all"} onValueChange={(v) => set({ stage: v === "all" ? null : v })}>
            <SelectTrigger className="md:w-44" aria-label="Stage">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {OPPORTUNITY_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {opportunityStageMeta(s).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.leadSource ?? "all"} onValueChange={(v) => set({ leadSource: v === "all" ? null : v })}>
            <SelectTrigger className="md:w-44" aria-label="Lead source">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {leadSources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.categoryId ?? "all"} onValueChange={(v) => set({ categoryId: v === "all" ? null : v })}>
            <SelectTrigger className="md:w-44" aria-label="Project type">
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
          <div className="col-span-2 flex items-end gap-2">
            <div className="flex-1 space-y-1 md:w-40 md:flex-none">
              <Label htmlFor="opp-from" className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
                Created from
              </Label>
              <Input id="opp-from" type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} />
            </div>
            <div className="flex-1 space-y-1 md:w-40 md:flex-none">
              <Label htmlFor="opp-to" className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
                to
              </Label>
              <Input id="opp-to" type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="col-span-2 justify-start md:col-span-1" onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, includeClosed: f.includeClosed }))}>
              <X className="mr-1 h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-2.5 shadow-card">
          <span className="text-sm font-bold text-foreground">{selected.size} selected</span>
          {view === "archived" ? (
            <Button size="sm" variant="outline" onClick={() => restoreMut.mutate([...selected])} disabled={restoreMut.isPending}>
              <ArchiveRestore className="mr-2 h-4 w-4" /> Restore
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete…
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Loading opportunities…</p>}

      {!isLoading && (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label="Select all shown" />
                    </th>
                    {th("title", "Opportunity", true)}
                    {th("client", "Client", true)}
                    {th("stage", "Stage")}
                    <th>Types</th>
                    {th("source", "Lead source", true)}
                    {th("value", "Value", false, "text-right")}
                    {th("created", "Created")}
                    {th("activity", "Last activity")}
                    {th("next", "Next", true)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.opp.id} className="cursor-pointer" onClick={() => navigate(`/pipeline/${r.opp.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(r.opp.id)} onCheckedChange={() => toggleOne(r.opp.id)} aria-label={`Select ${r.opp.title}`} />
                      </td>
                      <td className="font-bold text-foreground">{r.opp.title}</td>
                      <td className="text-muted-foreground">{r.opp.client?.name ?? "—"}</td>
                      <td>
                        <StatusPill meta={opportunityStageMeta(r.opp.stage)} />
                      </td>
                      <td>
                        <CategoryChips categoryIds={r.categoryIds} max={2} />
                      </td>
                      <td className="text-muted-foreground">{r.opp.lead_source ?? "—"}</td>
                      <td className="text-right font-bold tabular-nums">{r.value != null ? formatCurrency(r.value) : "—"}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{shortDate(r.opp.created_at)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{timeAgo(r.lastActivity)}</td>
                      <td className="max-w-[220px]">
                        <NextCell next={r.next} />
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-muted-foreground">
                        {view === "archived" ? "No archived opportunities." : hasFilters ? "No opportunities match these filters." : "No opportunities yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {sorted.map((r) => {
              const meta = opportunityStageMeta(r.opp.stage);
              return (
                <div key={r.opp.id} className="relative">
                  <ListCard
                    to={`/pipeline/${r.opp.id}`}
                    borderColor={meta.border}
                    eyebrow={meta.label}
                    eyebrowColor={meta.border}
                    eyebrowRight={r.value != null ? formatCurrency(r.value) : ""}
                    title={r.opp.title}
                    subtitle={[r.opp.client?.name, r.opp.lead_source].filter(Boolean).join(" · ")}
                  >
                    <CategoryChips categoryIds={r.categoryIds} className="mt-1.5" max={3} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <NextCell next={r.next} />
                      <span>{timeAgo(r.lastActivity)}</span>
                    </div>
                  </ListCard>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground">{view === "archived" ? "No archived opportunities." : "No opportunities match."}</p>
            )}
          </div>
        </>
      )}

      <DeleteOpportunitiesDialog
        opportunities={selectedOpps}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDone={() => setSelected(new Set())}
      />
      <CreateOpportunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

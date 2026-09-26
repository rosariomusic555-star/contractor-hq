import { useState } from "react";
import { costPlanTotal } from "@/lib/costPlanMath";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { SearchInput } from "@/components/common/SearchInput";
import { ListCard } from "@/components/common/ListCard";
import { formatCurrency, pluralize } from "@/lib/utils";
import { listMaterialsSheets, listAllMaterialsSections, type MaterialsSheet } from "@/lib/api";

/**
 * Every materials sheet across every project — the all-jobs rollup Quotes/
 * Invoices already have. Sheets are created transparently at the project
 * level (no standalone "new sheet" flow here); this is read + navigate,
 * same as clicking into one from its project's Materials hub card.
 */
export function MaterialSheetsView() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data: sheets = [], isLoading, isError, error } = useQuery({
    queryKey: ["materials-sheets"],
    queryFn: () => listMaterialsSheets(),
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["materials-sections"],
    queryFn: listAllMaterialsSections,
  });

  const sectionsBySheet = new Map<string, typeof sections>();
  for (const section of sections) {
    const list = sectionsBySheet.get(section.sheet_id);
    if (list) list.push(section);
    else sectionsBySheet.set(section.sheet_id, [section]);
  }
  const costFor = (sheet: MaterialsSheet) => costPlanTotal(sectionsBySheet.get(sheet.id) ?? []);
  const itemCountFor = (sheet: MaterialsSheet) =>
    (sectionsBySheet.get(sheet.id) ?? []).reduce((n, s) => n + s.materials_items.length, 0);

  const totalCost = sheets.reduce((sum, sheet) => sum + costFor(sheet), 0);

  const term = search.toLowerCase();
  const filtered = sheets.filter(
    (sheet) =>
      !term ||
      sheet.name.toLowerCase().includes(term) ||
      (sheet.project?.name ?? "").toLowerCase().includes(term),
  );

  const openSheet = (sheet: MaterialsSheet) => navigate(`/projects/${sheet.project_id}/materials/${sheet.id}`);

  return (
    <div className="animate-fade-in space-y-4 md:space-y-5">
      <MobilePageHeader title="Cost Plans" subtitle={`${pluralize(sheets.length, "plan")} · ${formatCurrency(totalCost)} total cost`}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search sheets or jobs"
          className="mt-3 border-white/20 bg-white/15 text-sidebar-foreground placeholder:text-sidebar-foreground/60 [&_svg]:text-sidebar-foreground/60"
        />
      </MobilePageHeader>

      <PageHeader
        title="Cost Plans"
        subtitle={`${pluralize(sheets.length, "plan")} across every job`}
      />

      <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Sheets" value={sheets.length} />
        <KpiCard label="Total cost" value={formatCurrency(totalCost)} />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search sheets or jobs" className="hidden md:flex md:max-w-xs" />

      {isLoading && <p className="text-muted-foreground">Loading cost plans…</p>}
      {isError && <p className="text-destructive">Failed to load cost plans: {(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          <div className="card-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Job</th>
                    <th>Items</th>
                    <th>Cost</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sheet) => (
                    <tr key={sheet.id} className="cursor-pointer" onClick={() => openSheet(sheet)}>
                      <td className="font-semibold text-foreground">{sheet.name}</td>
                      <td className="text-muted-foreground">{sheet.project?.name ?? "—"}</td>
                      <td className="text-muted-foreground">{pluralize(itemCountFor(sheet), "item")}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(costFor(sheet))}</td>
                      <td className="text-muted-foreground">{sheet.created_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No cost plans here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((sheet) => (
              <ListCard
                key={sheet.id}
                onClick={() => openSheet(sheet)}
                eyebrow={sheet.project?.name ?? "—"}
                eyebrowRight={formatCurrency(costFor(sheet))}
                title={sheet.name}
                subtitle={pluralize(itemCountFor(sheet), "item")}
              />
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No cost plans here.</p>}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { KpiCard } from "@/components/common/KpiCard";
import { OrderSheetDialog } from "@/components/materials/OrderSheetDialog";
import { useMaterialsCenter } from "@/hooks/use-materials-center";
import type { MaterialOrder } from "@/lib/api";
import { activeFeatures, countsTowardTotals, featureName as featureLabel } from "@/lib/features";
import type { MaterialLineView } from "@/lib/materialsCenter";
import { cn, formatCurrency, formatDate, pluralize } from "@/lib/utils";
import { LogDeliverySheet } from "./LogDeliverySheet";
import { AddOrderDeliveryForm } from "./AddOrderDeliveryForm";
import { OrdersTimeline } from "./OrdersTimeline";
import { DeliveryCalendar, FeatureStatus, LeftoversAndPallets, SuppliersPanel } from "./MaterialsCenterPanels";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");

function Section({ title, icon, right, children, className }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface space-y-3 p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * The project's materials command center (owner). Numbers come from
 * materialsCenterReport() — the Cost plan lines, orders / deliveries,
 * usage, the pre-construction rules — so they match the Cost plan, the
 * checklist, the Dashboard and the crew work order.
 */
export function MaterialsCenterView({ projectId }: { projectId: string }) {
  const data = useMaterialsCenter(projectId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderOpen, setOrderOpen] = useState(false);
  const [logging, setLogging] = useState<MaterialOrder | null>(null);
  const [adding, setAdding] = useState(false);
  const isMobile = useIsMobile();

  const live = useMemo(() => (data ? activeFeatures(data.features) : []), [data]);
  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">Loading materials…</div>;
  const { report: r, project, sections, catalog, priceBook, categories } = data;
  const featName = (id: string | null) => {
    const f = id ? live.find((x) => x.id === id) : undefined;
    return f ? featureLabel(f, categories) : "General";
  };
  const s = r.summary;
  const groups = new Map<string, MaterialLineView[]>();
  for (const l of r.stillToOrder) groups.set(l.featureId ?? "general", [...(groups.get(l.featureId ?? "general") ?? []), l]);
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const orderSections = sections
    .filter(countsTowardTotals)
    .map((sec) => ({ ...sec, materials_items: sec.materials_items.filter((i) => (i.cost_type ?? "material") === "material") }));
  const overrides = new Map(r.stillToOrder.filter((l) => selected.has(l.id)).map((l) => [l.id, l.toOrder]));
  const readyIssues = r.readiness.short.length + r.readiness.unscheduled.length;
  const days = r.readiness.daysToStart;
  const jobDone = project.status === "complete";

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      {/* Headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="To order" value={String(r.stillToOrder.length)} sub={r.stillToOrder.length ? `${pluralize(r.stillToOrder.length, "line")} short` : "everything's ordered"} subTone={r.stillToOrder.length ? "negative" : "muted"} />
        <KpiCard label="Ordered" value={`${s.fullyOrdered}/${s.lineCount}`} sub={pct(s.fullyOrdered, s.lineCount)} />
        <KpiCard label="Delivered" value={`${s.fullyDelivered}/${s.lineCount}`} sub={pct(s.fullyDelivered, s.lineCount)} />
        <KpiCard label="In use" value={`${s.inUse}/${s.lineCount}`} sub={pct(s.inUse, s.lineCount)} />
        <KpiCard
          label="Ordered vs planned"
          value={formatCurrency(s.orderedCost)}
          sub={`of ${formatCurrency(s.plannedCost)} planned${s.plannedCost ? ` · ${s.orderedCost - s.plannedCost >= 0 ? "+" : "−"}${formatCurrency(Math.abs(s.orderedCost - s.plannedCost))}` : ""}`}
          className="col-span-2 lg:col-span-1"
        />
        <KpiCard
          label="Next delivery"
          value={s.nextDelivery ? formatDate(s.nextDelivery.date) : "—"}
          sub={s.nextDelivery ? `${s.nextDelivery.order.supplier ?? "Supplier"} · ${s.nextDelivery.items.slice(0, 2).join(", ")}${s.nextDelivery.items.length > 2 ? ` +${s.nextDelivery.items.length - 2}` : ""}` : "nothing scheduled"}
        />
        <KpiCard label="Open issues" value={String(r.issues.length)} sub={r.issues.length ? r.issues.slice(0, 2).map((i) => i.label).join(", ") : "none"} subTone={r.issues.length ? "negative" : "muted"} />
      </div>

      {/* Readiness */}
      {r.readiness.before && (
        <section className={cn("card-surface p-4", readyIssues ? "border-warning/50" : "")}>
          <p className="text-sm font-semibold text-foreground">
            {days == null ? "No start date yet" : days > 0 ? `Starts in ${pluralize(days, "day")}` : days === 0 ? "Starts today" : "Started"}
            {readyIssues === 0 ? <span className="font-normal text-success"> · materials are ordered and arriving before the start</span> : null}
          </p>
          {readyIssues > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-warning-strong">
              {r.readiness.short.length > 0 && (
                <li className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {pluralize(r.readiness.short.length, "line")} not fully ordered
                </li>
              )}
              {r.readiness.unscheduled.length > 0 && (
                <li className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {pluralize(r.readiness.unscheduled.length, "line")} with no delivery by the start date
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      {/* Still to order */}
      <Section
        title="Still to order"
        icon={<ShoppingCart className="h-4 w-4 text-muted-subtle" />}
        right={
          r.stillToOrder.length > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === r.stillToOrder.length ? new Set() : new Set(r.stillToOrder.map((l) => l.id)))}>
                {selected.size === r.stillToOrder.length ? "Clear" : "Select all"}
              </Button>
              <Button size="sm" className="font-bold" disabled={selected.size === 0} onClick={() => setOrderOpen(true)}>
                Create order{selected.size ? ` (${selected.size})` : ""}
              </Button>
            </div>
          )
        }
      >
        {r.stillToOrder.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every material line is fully ordered.</p>
        ) : (
          <div className="space-y-3">
            {[...groups.entries()].map(([k, ls]) => (
              <div key={k}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{featName(k === "general" ? null : k)}</div>
                <ul className="divide-y divide-hairline rounded-lg border border-hairline">
                  {ls.map((l) => (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                        <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} className="mt-0.5" aria-label={`Order ${l.label}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground [overflow-wrap:anywhere]">{l.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            Need {qty(l.needed)} {l.unit} · ordered {qty(l.ordered)} · <span className="font-semibold text-foreground">{qty(l.toOrder)} to order</span>
                            {l.orderableHint != null && <span className="text-info"> · order {qty(l.orderableHint)} (full packages)</span>}
                          </span>
                          {l.usualSupplier && <span className="block text-[11px] text-muted-subtle">Usually from {l.usualSupplier}</span>}
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(l.toOrder * l.unitCost)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Orders and deliveries */}
      <Section
        title="Orders and deliveries"
        icon={<PackageCheck className="h-4 w-4 text-muted-subtle" />}
        right={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> New order / delivery
          </Button>
        }
      >
        <OrdersTimeline orders={r.orders} suppliers={data.suppliers} sections={sections} rainDates={data.rainDates} onLogDelivery={setLogging} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Status by feature">
          {data.active ? (
            <FeatureStatus lines={r.lines} featureName={featName} projectId={projectId} />
          ) : (
            <p className="text-sm text-muted-foreground">Tracking starts once the job is won.</p>
          )}
        </Section>
        <Section title="Delivery calendar" icon={<CalendarDays className="h-4 w-4 text-muted-subtle" />}>
          <DeliveryCalendar report={r} start={project.scheduled_start_date} forecastOk={data.forecastOk} />
        </Section>
        <Section title="Leftovers, returns and pallets">
          <LeftoversAndPallets report={r} jobDone={jobDone} />
        </Section>
        <Section title="Suppliers">
          <SuppliersPanel report={r} />
        </Section>
      </div>

      {/* Phones: the order button follows you down the checklist. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 pl-4 pr-24 md:hidden">
          <Button className="h-12 w-full font-bold shadow-lg" onClick={() => setOrderOpen(true)}>
            Create order ({selected.size})
          </Button>
        </div>
      )}

      <OrderSheetDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        projectId={projectId}
        projectName={project.name}
        deliveryAddress={project.address ?? null}
        sections={orderSections}
        catalogItems={catalog}
        priceBookItems={priceBook}
        initialSelectedIds={[...selected]}
        quantityOverrides={overrides}
        onOrdered={() => setSelected(new Set())}
      />
      {/* Anything by hand — unplanned material, a delivery with no order, just a total. */}
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[92dvh] rounded-t-2xl px-3 pb-6 pt-5" : "w-full sm:max-w-2xl")}>
          <SheetHeader className="mb-3 text-left">
            <SheetTitle>New order or delivery</SheetTitle>
          </SheetHeader>
          <AddOrderDeliveryForm projectId={projectId} onSaved={() => setAdding(false)} />
        </SheetContent>
      </Sheet>
      <LogDeliverySheet order={logging} open={!!logging} onOpenChange={(v) => !v && setLogging(null)} showPrices />
    </div>
  );
}

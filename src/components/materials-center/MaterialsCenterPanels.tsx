import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudRain, Hammer, Mail, MapPin, MoveRight, Phone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { reconcileMaterialsItem } from "@/lib/api";
import { lineStatusLabel } from "@/lib/materialTracking";
import { OverEstimateNote } from "@/components/materials/OverEstimateNote";
import type { MaterialLineView, MaterialsCenterReport } from "@/lib/materialsCenter";
import { cn, formatCurrency } from "@/lib/utils";

const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");

/** planned → ordered → delivered (→ used, on a usage-tracked line), one
 * compact bar. */
function StageBar({ l }: { l: MaterialLineView }) {
  const used = l.tracked ? l.used : 0;
  const max = Math.max(l.needed, l.ordered, l.delivered, used, 1e-9);
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary" title={`ordered ${qty(l.ordered)} · delivered ${qty(l.delivered)}${l.tracked ? ` · used ${qty(used)}` : ""} of ${qty(l.needed)}`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-info/30" style={{ width: w(l.ordered) }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60" style={{ width: w(l.delivered) }} />
      {l.tracked && <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: w(used) }} />}
      <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `calc(${w(l.needed)} - 1px)` }} />
    </div>
  );
}

export function FeatureStatus({
  lines,
  featureName,
  projectId,
}: {
  lines: MaterialLineView[];
  featureName: (id: string | null) => string;
  projectId: string;
}) {
  const groups = new Map<string, MaterialLineView[]>();
  for (const l of lines) {
    const k = l.featureId ?? "general";
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-info/30" />ordered</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary/60" />delivered</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-success" />used</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-foreground/60" />needed</span>
      </p>
      {[...groups.entries()].map(([k, ls]) => (
        <div key={k}>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{featureName(k === "general" ? null : k)}</div>
          <ul className="space-y-2">
            {ls.map((l) => (
              <li key={l.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to={`/projects/${projectId}/materials`} className="min-w-0 truncate text-foreground hover:underline" title={l.label}>{l.label}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{lineStatusLabel(l.status, l.needed, l.ordered)}</span>
                </div>
                <StageBar l={l} />
                {l.over && <OverEstimateNote used={l.used} estimated={l.needed} unit={l.unit} className="mt-0.5" />}
                <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-subtle">
                  <span>
                    {l.tracked
                      ? `${qty(l.ordered)} / ${qty(l.delivered)} / ${qty(l.used)} of ${qty(l.needed)} ${l.unit ?? ""}`
                      : `${qty(l.ordered)} / ${qty(l.delivered)} of ${qty(l.needed)} ${l.unit ?? ""}`}
                  </span>
                  <span>
                    {l.tracked && l.onSite > 0 ? `${qty(l.onSite)} ${l.unit} on site` : ""}
                    {l.variance != null ? <span className={cn("ml-2", l.variance > 0 ? "text-destructive" : "")}>{signed(l.variance)}</span> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function LeftoversAndPallets({ report, jobDone }: { report: MaterialsCenterReport; jobDone: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [credit, setCredit] = useState<Record<string, string>>({});
  const settle = useMutation({
    mutationFn: ({ id, disposition, amount }: { id: string; disposition: "returned" | "kept" | "waste"; amount?: number }) =>
      reconcileMaterialsItem(id, { disposition, return_credit: amount ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const left = report.leftovers;
  const DISP: Record<string, string> = { returned: "Returned to supplier", kept: "Kept for another job", waste: "Written off" };
  return (
    <div className="space-y-4">
      {!jobDone && left.length > 0 && <p className="text-xs text-muted-foreground">Settle leftovers near the end of the job — they're what's delivered but not logged as used.</p>}
      {left.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leftover material — nothing delivered is sitting unused.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {left.map((l) => (
            <li key={l.id} className="py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground" title={l.label}>{l.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{qty(l.onSite)} {l.unit} left</span>
              </div>
              {l.disposition ? (
                <p className="mt-0.5 text-xs text-success">
                  {DISP[l.disposition]}
                  {l.disposition === "returned" && l.returnCredit ? ` · ${formatCurrency(l.returnCredit)} credit` : ""}
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Input
                    inputMode="decimal"
                    placeholder="Credit $"
                    value={credit[l.id] ?? (l.onSite && l.unitCost ? String(Math.round(l.onSite * l.unitCost * 100) / 100) : "")}
                    onChange={(e) => setCredit((c) => ({ ...c, [l.id]: e.target.value }))}
                    className="h-8 w-24 text-xs"
                    aria-label="Expected credit"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => settle.mutate({ id: l.id, disposition: "returned", amount: Number(credit[l.id] ?? l.onSite * l.unitCost) || 0 })}>
                    Return
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => settle.mutate({ id: l.id, disposition: "kept" })}>
                    Keep for another job
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => settle.mutate({ id: l.id, disposition: "waste" })}>
                    Write off
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Pallet deposits</div>
        {report.pallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pallets recorded. Add pallets and the deposit per pallet on an order (Edit) or when you log a delivery.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {report.pallets.map((p) => (
              <li key={p.supplier} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-foreground">
                  {p.supplier} · {p.delivered} dropped · {p.returned} returned
                  {p.outstanding > 0 && <span className="ml-1 font-semibold text-warning-strong">· {p.outstanding} to return</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(p.charged)} deposit · {formatCurrency(p.credit)} back</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.credits.total > 0 && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">
          Supplier credits: {formatCurrency(report.credits.total)} ({formatCurrency(report.credits.returns)} returns, {formatCurrency(report.credits.pallets)} pallets) — they reduce actual material cost and show as credits in Job costs.
        </p>
      )}
    </div>
  );
}

export function DeliveryCalendar({ report, start, forecastOk }: { report: MaterialsCenterReport; start: string | null; forecastOk: boolean }) {
  const work = new Set(report.calendar.workDays);
  const byDate = new Map<string, MaterialsCenterReport["calendar"]["items"]>();
  for (const i of report.calendar.items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);
  const dates = [...new Set([...report.calendar.workDays, ...byDate.keys()])].sort();
  if (dates.length === 0) return <p className="text-sm text-muted-foreground">Schedule the job and set delivery dates to see them here.</p>;
  return (
    <div className="space-y-2">
      {!forecastOk && <p className="text-[11px] text-muted-subtle">Rain flags need the job's address and a forecast (about 9 days out).</p>}
      <ol className="space-y-1">
        {dates.map((d) => {
          const items = byDate.get(d) ?? [];
          const isWork = work.has(d);
          return (
            <li key={d} className={cn("flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm", isWork ? "bg-muted/40" : "")}>
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {isWork && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                    <Hammer className="h-3 w-3" /> {start === d ? "Start" : "Work day"}
                  </span>
                )}
                {items.map((i) => (
                  <span
                    key={i.orderId}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                      i.kind === "delivered" ? "bg-primary/15 text-success" : i.afterStart ? "bg-warning/15 text-warning-strong" : "bg-info/15 text-info",
                    )}
                  >
                    <Truck className="h-3 w-3" />
                    {i.supplier ?? "Delivery"}
                    {i.kind === "delivered" ? " ✓" : ""}
                    {i.rain && <CloudRain className="h-3 w-3" aria-label="Rain in the forecast" />}
                    {i.moved && <MoveRight className="h-3 w-3" aria-label="Moved by a rain delay" />}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SuppliersPanel({ report }: { report: MaterialsCenterReport }) {
  if (report.suppliers.length === 0) return <p className="text-sm text-muted-foreground">No supplier on any order yet.</p>;
  return (
    <ul className="space-y-2">
      {report.suppliers.map((s) => (
        <li key={s.name} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-semibold text-foreground">{s.name}</span>
            <span className="shrink-0 font-bold tabular-nums">{formatCurrency(s.spend)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {s.orders} order{s.orders === 1 ? "" : "s"}
            {s.openOrders ? ` · ${s.openOrders} open` : ""}
          </p>
          {s.contact && (s.contact.phone || s.contact.email || s.contact.address) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.contact.phone && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={telOf(s.contact.phone)}><Phone className="mr-1 h-3.5 w-3.5" />{s.contact.phone}</a>
                </Button>
              )}
              {s.contact.email && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`mailto:${s.contact.email}`}><Mail className="mr-1 h-3.5 w-3.5" />Email</a>
                </Button>
              )}
              {s.contact.address && (
                <Button asChild size="sm" variant="ghost" className="h-8">
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(s.contact.address)}`} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-3.5 w-3.5" />Map</a>
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
      <li className="text-[11px] text-muted-subtle">Contacts live in Settings › Suppliers.</li>
    </ul>
  );
}


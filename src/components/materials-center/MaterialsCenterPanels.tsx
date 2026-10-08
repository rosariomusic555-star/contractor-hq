import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudRain, Hammer, Mail, MapPin, MoveRight, Phone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { reconcileMaterialsItem } from "@/lib/api";
import { LINE_MATERIAL_STATUS_LABEL, lineMaterialStatus } from "@/lib/purchases";

import { OverEstimateNote } from "@/components/materials/OverEstimateNote";
import type { MaterialLineView, MaterialsCenterReport } from "@/lib/materialsCenter";
import { cn, formatCurrency } from "@/lib/utils";

const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");

/** Not purchased → Partially purchased → Purchased → Partly on site → On site. */
const purchaseStatusText = (l: Pick<MaterialLineView, "needed" | "ordered" | "delivered">) => {
  const st = lineMaterialStatus(l.needed, l.ordered, l.delivered);
  return st === "purchased" && l.delivered > 1e-6 ? "Partly on site" : LINE_MATERIAL_STATUS_LABEL[st];
};

/** planned → ordered → delivered (→ used, on a usage-tracked line), one
 * compact bar. */
function StageBar({ l }: { l: MaterialLineView }) {
  const used = l.tracked ? l.used : 0;
  const max = Math.max(l.needed, l.ordered, l.delivered, used, 1e-9);
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary" title={`purchased ${qty(l.ordered)} · on site ${qty(l.delivered)}${l.tracked ? ` · used ${qty(used)}` : ""} of ${qty(l.needed)}`}>
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
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-info/30" />purchased</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary/60" />on site</span>
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
                  <span className="shrink-0 text-xs text-muted-foreground">{purchaseStatusText(l)}</span>
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


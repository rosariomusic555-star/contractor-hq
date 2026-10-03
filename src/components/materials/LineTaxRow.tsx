import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { formatCurrency } from "@/lib/utils";
import { formatTaxRate } from "@/lib/costPlanMath";
import type { LineTaxView } from "@/lib/costPlanTax";

/**
 * The sales tax strip on a Cost plan line (internal cost, never on client
 * documents): Taxable toggle, the rate used and where it comes from, and
 * "$6,300.00 + 7.25% tax $456.75 = $6,756.75". Typing a rate makes it the
 * line's own; "Use default" hands it back to the supplier / default rate.
 * Material lines also pick their supplier here, since a supplier can carry
 * its own rate (Settings › Suppliers). Wraps cleanly on phones.
 */
export function LineTaxRow({
  tax,
  cost,
  vendor,
  onToggle,
  onRate,
  onVendor,
}: {
  tax: LineTaxView;
  /** The line's pre-tax cost. */
  cost: number;
  vendor: string;
  onToggle: (taxable: boolean) => void;
  /** A typed rate, or null to go back to the supplier / default rate. */
  onRate: (rate: number | null) => void;
  /** Material lines: the supplier picker. Other lines edit their vendor above. */
  onVendor?: (vendor: string) => void;
}) {
  const [rateStr, setRateStr] = useState(String(tax.rate));
  useEffect(() => setRateStr(String(tax.rate)), [tax.rate]);
  const amount = tax.taxable ? Math.round(((cost * tax.rate) / 100) * 100) / 100 : 0;
  const sourceLabel =
    tax.source === "custom" ? "this line's rate" : tax.source === "supplier" ? `${vendor.trim() || "supplier"} rate` : "default rate";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/50 px-3 py-2">
      {onVendor && (
        <div className="w-full sm:w-48">
          <SupplierCombobox value={vendor} onChange={onVendor} placeholder="Supplier (optional)" className="h-9 w-full" />
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Switch checked={tax.taxable} onCheckedChange={onToggle} aria-label="Taxable" />
        Taxable
      </label>
      {tax.taxable && (
        <>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Input
                type="number"
                step="any"
                min={0}
                max={100}
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => {
                  setRateStr(e.target.value);
                  const v = parseFloat(e.target.value);
                  onRate(isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                }}
                aria-label="Sales tax rate percent"
                className="h-8 w-[84px] pr-6 text-right text-sm tabular-nums"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
            <span className="text-xs text-muted-foreground">{sourceLabel}</span>
            {tax.source === "custom" && (
              <button type="button" onClick={() => onRate(null)} className="text-xs font-semibold text-primary hover:underline">
                Use default
              </button>
            )}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
            {formatCurrency(cost)} + {formatTaxRate(tax.rate)} tax {formatCurrency(amount)} ={" "}
            <span className="font-semibold text-foreground">{formatCurrency(cost + amount)}</span>
          </span>
        </>
      )}
      {!tax.taxable && <span className="text-xs text-muted-foreground sm:ml-auto">No tax on this line</span>}
    </div>
  );
}

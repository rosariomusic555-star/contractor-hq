import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { COST_PLAN_TAX_RATE_KEY, getCostPlanTaxRate, listSuppliers, saveCostPlanTaxRate } from "@/lib/api";

/**
 * Settings › Cost plan tax (0163) — the sales tax the contractor pays on
 * taxable purchases (Material and Equipment lines by default). Internal
 * cost only: it raises the Cost plan, Est. cost and every profit figure,
 * never anything a client sees. Separate from the sales tax charged to the
 * client on quotes (Quote defaults). Saving re-figures open jobs' lines in
 * the DB; completed jobs keep the rate they were costed at.
 */
export function SettingsCostPlanTaxView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rate, isLoading } = useQuery({ queryKey: COST_PLAN_TAX_RATE_KEY, queryFn: getCostPlanTaxRate });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const overrides = suppliers.filter((s) => s.tax_rate != null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (rate != null) setValue(String(rate));
  }, [rate]);

  const n = Number(value);
  const valid = value.trim() !== "" && isFinite(n) && n >= 0 && n <= 100;
  const dirty = rate != null && valid && n !== rate;

  const save = useMutation({
    mutationFn: () => saveCostPlanTaxRate(n),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COST_PLAN_TAX_RATE_KEY });
      // Open jobs' lines were re-figured in the DB.
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Sales tax rate saved", description: "Open jobs' cost plans now use it." });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Cost plan tax" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Cost plan tax</h1>
      </div>

      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Sales tax you pay</h2>
        <p className="text-xs text-muted-foreground">
          Added to taxable Cost plan lines (Material and Equipment by default, each line can be switched) so your costs, Est. cost and
          profit include it. Internal only. Clients never see it, and it's separate from the tax you charge on quotes (
          <Link to="/settings/quote-defaults" className="font-semibold text-primary hover:text-primary/80">
            Quote defaults
          </Link>
          ).
        </p>
        <label className="block max-w-[220px]">
          <span className="text-xs font-semibold text-muted-foreground">Default rate (%)</span>
          <div className="relative mt-1">
            <Input
              inputMode="decimal"
              value={value}
              disabled={isLoading}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 7.25"
              className="pr-8 tabular-nums"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </label>
        {!valid && value.trim() !== "" && <p className="text-xs text-destructive">Enter a rate from 0 to 100.</p>}
        <p className="text-[11px] text-muted-subtle">
          Saving updates the plans of jobs that are estimating, scheduled or in progress. Completed jobs keep the rate they were costed at, and
          a rate typed on a line stays as typed.
        </p>
        <div className="flex justify-end">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </section>

      <section className="card-surface space-y-2 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Suppliers in other tax areas</h2>
        <p className="text-xs text-muted-foreground">
          Give a supplier its own rate in{" "}
          <Link to="/settings/suppliers" className="font-semibold text-primary hover:text-primary/80">
            Suppliers
          </Link>
          . Lines with that supplier use its rate instead of the default.
        </p>
        {overrides.length > 0 && (
          <ul className="divide-y divide-hairline text-sm">
            {overrides.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="font-semibold text-foreground">{s.name}</span>
                <span className="tabular-nums text-muted-foreground">{Number(s.tax_rate)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

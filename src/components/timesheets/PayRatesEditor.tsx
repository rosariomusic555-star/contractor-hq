import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { addPayRate, deletePayRate, listPayRates } from "@/lib/api";
import { isoDay } from "@/lib/timesheets";

/**
 * Pay rate history for one employee (0131, owner only — the table isn't
 * readable by employees at all). A new rate takes effect on its date, so a
 * raise never rewrites earlier weeks; approved timesheets are never
 * re-costed.
 */
export function PayRatesEditor({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: all = [] } = useQuery({ queryKey: ["pay-rates"], queryFn: listPayRates });
  const rates = all.filter((r) => r.employee_id === employeeId);
  const today = isoDay(new Date());
  const current = rates.find((r) => r.effective_date <= today);
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(today);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pay-rates"] });
    qc.invalidateQueries({ queryKey: ["timesheets"] });
    qc.invalidateQueries({ queryKey: ["labor-entries"] });
  };
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const add = useMutation({
    mutationFn: () => addPayRate({ employee_id: employeeId, rate: Number(rate), effective_date: from }),
    onSuccess: () => (setRate(""), refresh(), toast({ title: "Pay rate saved" })),
    onError,
  });
  const del = useMutation({ mutationFn: deletePayRate, onSuccess: refresh, onError });

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Pay rate · owner only</p>
      <p className="text-sm text-foreground">{current ? `$${current.rate}/hr` : <span className="text-destructive">No rate yet — hours can't be costed or paid</span>}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-muted-foreground">New rate ($/hr)</span>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 h-10 w-28" />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Effective</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-40" />
        </label>
        <Button className="h-10" disabled={!(Number(rate) >= 0) || rate.trim() === "" || !from || add.isPending} onClick={() => add.mutate()}>
          Save rate
        </Button>
      </div>
      {rates.length > 0 && (
        <ul className="space-y-1 pt-1">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">${r.rate}/hr</span> from {r.effective_date}
              {r.effective_date > today && <span className="rounded bg-info/10 px-1 text-info">upcoming</span>}
              <button type="button" onClick={() => del.mutate(r.id)} className="ml-auto hover:text-destructive" aria-label="Delete rate">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

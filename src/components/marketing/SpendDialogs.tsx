import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { saveLeadSourceSpend, type LeadSourceSpend } from "@/lib/api";
import { addMonths, monthLabel, ym } from "@/lib/marketingRoi";

const parseAmount = (v: string): number | null => {
  const t = v.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};
const key = (source: string, month: string) => `${source}|${month}`;

function useSaveSpend(onDone: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: saveLeadSourceSpend,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-source-spend"] });
      toast({ title: "Spend saved" });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
}

/**
 * Desktop: paid sources × the period's months (up to 12) in one grid.
 * Local draft + Save — nothing is written while typing. Clearing a cell
 * removes that month's spend.
 */
export function SpendGridDialog({
  open,
  onOpenChange,
  sources,
  months,
  spend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sources: string[];
  months: string[];
  spend: LeadSourceSpend[];
}) {
  const shown = months.slice(-12);
  const saved = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spend) m.set(key(s.lead_source, s.month.slice(0, 7)), s.amount);
    return m;
  }, [spend]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setDraft({});
  }, [open]);
  const save = useSaveSpend(() => onOpenChange(false));

  const changed = Object.entries(draft).filter(([k, v]) => (parseAmount(v) ?? null) !== (saved.get(k) ?? null));
  const invalid = changed.some(([, v]) => Number.isNaN(parseAmount(v)));
  const cell = (s: string, m: string) => draft[key(s, m)] ?? (saved.has(key(s, m)) ? String(saved.get(key(s, m))) : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Ad spend</DialogTitle>
          <DialogDescription>What you paid each source per month. Leave a cell empty for no spend. Free sources aren't listed — mark a source paid in Settings › Lead sources.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                <th className="sticky left-0 bg-background px-2 py-2">Source</th>
                {shown.map((m) => (
                  <th key={m} className="px-1 py-2 text-right">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const total = shown.reduce((a, m) => a + (parseAmount(cell(s, m)) || 0), 0);
                return (
                  <tr key={s} className="border-t border-hairline">
                    <td className="sticky left-0 bg-background px-2 py-1.5 font-semibold text-foreground">{s}</td>
                    {shown.map((m) => (
                      <td key={m} className="px-1 py-1.5">
                        <Input
                          inputMode="decimal"
                          value={cell(s, m)}
                          onChange={(e) => setDraft((d) => ({ ...d, [key(s, m)]: e.target.value }))}
                          className="h-9 w-24 text-right tabular-nums"
                          aria-label={`${s} ${monthLabel(m)}`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sources.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No paid lead sources yet.</p>}
        </div>
        <div className="flex items-center justify-end gap-2">
          {invalid && <span className="mr-auto text-xs text-destructive">Amounts must be numbers.</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!changed.length || invalid || save.isPending}
            onClick={() =>
              save.mutate(
                changed.map(([k, v]) => {
                  const [lead_source, month] = k.split("|");
                  const amount = parseAmount(v);
                  const note = spend.find((x) => x.lead_source === lead_source && x.month.startsWith(month))?.note ?? null;
                  return { lead_source, month: `${month}-01`, amount: amount || amount === 0 ? amount : null, note };
                }),
              )
            }
          >
            Save{changed.length ? ` ${changed.length} change${changed.length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phones, and Settings › Lead sources › Monthly spend: one source, month +
 * amount (numeric keypad) + optional note, with that source's last 12
 * months below to tap and edit.
 */
export function SpendFormDialog({
  open,
  onOpenChange,
  sources,
  fixedSource,
  spend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sources: string[];
  fixedSource?: string | null;
  spend: LeadSourceSpend[];
}) {
  const current = ym(new Date());
  const [source, setSource] = useState(fixedSource ?? "");
  const [month, setMonth] = useState(current);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const existing = (s: string, m: string) => spend.find((x) => x.lead_source === s && x.month.startsWith(m));
  const load = (s: string, m: string) => {
    const e = existing(s, m);
    setAmount(e ? String(e.amount) : "");
    setNote(e?.note ?? "");
  };
  useEffect(() => {
    if (!open) return;
    const s = fixedSource ?? sources[0] ?? "";
    setSource(s);
    setMonth(current);
    load(s, current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedSource]);
  const save = useSaveSpend(() => {
    if (!fixedSource) onOpenChange(false);
  });
  const parsed = parseAmount(amount);
  const history = Array.from({ length: 12 }, (_, i) => addMonths(current, -i));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{fixedSource ? `${fixedSource} — monthly spend` : "Add spend"}</DialogTitle>
          <DialogDescription>What you paid for this source that month. Clear the amount to remove it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!fixedSource && (
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Lead source</span>
              <Select
                value={source}
                onValueChange={(v) => {
                  setSource(v);
                  load(v, month);
                }}
              >
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue placeholder="Pick a source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Month</span>
              <Input
                type="month"
                value={month}
                max={current}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setMonth(e.target.value);
                  load(source, e.target.value);
                }}
                className="mt-1 h-11"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Amount</span>
              <Input inputMode="decimal" placeholder="$0" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-11 text-right tabular-nums" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Note (optional)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Spring campaign" className="mt-1 h-11" />
          </label>
          <Button
            className="h-11 w-full"
            disabled={!source || Number.isNaN(parsed) || save.isPending || (parsed == null && !existing(source, month))}
            onClick={() => save.mutate([{ lead_source: source, month: `${month}-01`, amount: parsed, note }])}
          >
            {parsed == null && existing(source, month) ? "Remove" : "Save"}
          </Button>
          {source && (
            <ul className="divide-y divide-hairline border-t border-hairline pt-1">
              {history.map((m) => {
                const e = existing(source, m);
                return (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => {
                        setMonth(m);
                        load(source, m);
                      }}
                      className="flex w-full items-center justify-between py-2 text-left text-sm"
                    >
                      <span className={m === month ? "font-bold text-foreground" : "text-muted-foreground"}>
                        {monthLabel(m)}
                        {e?.note ? <span className="text-xs text-muted-subtle"> · {e.note}</span> : null}
                      </span>
                      <span className="tabular-nums text-foreground">{e ? formatCurrency(e.amount) : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

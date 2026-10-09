import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useShowOverEstimateNotes } from "@/hooks/use-show-over-estimate-notes";
import { addUsageLog, deleteUsageLog, type MaterialsItem, type MaterialsUsageLog } from "@/lib/api";
import { materialLineLabel } from "@/lib/materialsMath";
import { overEstimate } from "@/lib/materialTracking";
import { allDayDateTime, localYmd } from "@/lib/appointmentTime";
import { clampQty, unitWord, usageDay, usageDayBars, usageStep } from "@/lib/usageCards";
import { cn } from "@/lib/utils";

const fmt = (n: number) => String(clampQty(n));
const dayLabel = (ymd: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", opts);
/** Faint bars for a line with nothing logged yet. */
const PLACEHOLDER = [35, 55, 30, 70, 45, 60, 40];

/**
 * One tracked material line on the Materials tab, as a "log it in one tap"
 * card: the amount to log (− / + by the unit's step, or typed), the day and
 * an optional note, a small per-day usage chart with used vs. estimated, and
 * a full-width Log button. Same data and writes as Log usage
 * (addUsageLog / deleteUsageLog); History opens the existing history dialog.
 */
export function UsageTrackingCard({
  line,
  feature,
  estimated,
  used,
  usageLogs,
  onShowHistory,
}: {
  line: MaterialsItem;
  /** The line's Cost plan section (feature) — "Paver Patio", "General". */
  feature: string;
  estimated: number;
  used: number;
  usageLogs: MaterialsUsageLog[];
  onShowHistory: (line: MaterialsItem) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const showOver = useShowOverEstimateNotes();
  const label = materialLineLabel(line);
  const step = usageStep(line.unit);
  const today = localYmd(new Date());

  // Starts at 0 (not the last amount logged): lines are often logged in
  // big one-off amounts, and repeating one by accident is worse than one
  // extra tap on +.
  const [qty, setQty] = useState(0);
  const [draft, setDraft] = useState<string | null>(null); // while typing
  const [date, setDate] = useState(today);
  const [pickingDate, setPickingDate] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const bars = usageDayBars(usageLogs, line.id);
  const entries = usageLogs.filter((u) => u.materials_item_id === line.id).length;
  const max = Math.max(...bars.map((b) => b.quantity), 0);
  const pct = estimated > 0 ? Math.round((used / estimated) * 100) : used > 0 ? 100 : 0;
  const over = overEstimate(estimated, used) ? clampQty(used - estimated) : 0;
  const unitShort = line.unit || "units";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["materials-usage-logs"] });
    qc.invalidateQueries({ queryKey: ["materials-usage-logs-for-item", line.id] });
    qc.invalidateQueries({ queryKey: ["materials"] });
    qc.invalidateQueries({ queryKey: ["materials-sections-all"] });
  };

  const undoMut = useMutation({
    mutationFn: (id: string) => deleteUsageLog(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Usage entry removed" });
    },
    onError: (err: Error) => toast({ title: "Couldn't undo", description: err.message, variant: "destructive" }),
  });

  const logMut = useMutation({
    mutationFn: (amount: number) =>
      addUsageLog({
        materials_item_id: line.id,
        quantity: amount,
        // Today → the actual time; an earlier day → local noon of that day (as Log usage).
        logged_at: date === today ? new Date().toISOString() : allDayDateTime(date),
        note: note.trim() || null,
      }),
    onSuccess: (created, amount) => {
      invalidate();
      toast({
        title: `Logged ${fmt(amount)} ${unitWord(line.unit, amount)} of ${label}`,
        action: (
          <ToastAction altText="Undo" onClick={() => undoMut.mutate(created.id)}>
            Undo
          </ToastAction>
        ),
      });
      setQty(0);
      setDate(today);
      setPickingDate(false);
      setNote("");
      setNoteOpen(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: (entry: MaterialsUsageLog) => deleteUsageLog(entry.id).then(() => entry),
    onSuccess: (entry) => {
      invalidate();
      toast({
        title: `Removed ${fmt(Number(entry.quantity))} ${unitWord(line.unit, Number(entry.quantity))} from ${dayLabel(usageDay(entry.logged_at))}`,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() =>
              addUsageLog({
                materials_item_id: entry.materials_item_id,
                quantity: Number(entry.quantity),
                logged_at: entry.logged_at,
                note: entry.note,
                logged_by: entry.logged_by,
                photo_path: entry.photo_path,
              }).then(invalidate, (err: Error) => toast({ title: "Couldn't undo", description: err.message, variant: "destructive" }))
            }
          >
            Undo
          </ToastAction>
        ),
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const commitDraft = () => {
    if (draft == null) return;
    setQty(clampQty(parseFloat(draft)));
    setDraft(null);
  };

  const unitPlural = unitWord(line.unit, qty);
  const summary =
    bars.length === 0
      ? "No usage logged yet."
      : `Usage by day: ${bars.map((b) => `${dayLabel(b.day)} ${fmt(b.quantity)} ${unitShort}`).join(", ")}.`;

  return (
    <article className="card-surface flex flex-col gap-5 p-5" aria-label={label}>
      {/* 1 · Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[15px] font-bold text-foreground">{label}</h4>
          <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
            {feature} · {fmt(used)} of {fmt(estimated)} {unitShort} used
          </p>
        </div>
        {entries > 0 && (
          <button
            type="button"
            onClick={() => onShowHistory(line)}
            className="min-h-8 shrink-0 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            History
          </button>
        )}
      </header>

      {/* 2 · Amount to log */}
      <div className="flex flex-col items-center">
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setQty((q) => clampQty(q - step))}
            disabled={qty <= 0}
            aria-label="Decrease quantity"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Minus className="h-5 w-5" />
          </button>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Quantity to log, in ${unitWord(line.unit, 2)}`}
            value={draft ?? fmt(qty)}
            onFocus={(e) => {
              setDraft(fmt(qty));
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="min-w-0 flex-1 rounded-lg bg-transparent text-center text-5xl font-extrabold tabular-nums tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => setQty((q) => clampQty(q + step))}
            aria-label="Increase quantity"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{unitPlural}</p>

        <div className="mt-2 flex items-center gap-1">
          {pickingDate ? (
            <Input
              type="date"
              aria-label="Usage date"
              value={date}
              max={today}
              autoFocus
              onChange={(e) => setDate(e.target.value || today)}
              onBlur={() => setPickingDate(false)}
              className="h-9 w-40 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPickingDate(true)}
              aria-label={`Usage date: ${date === today ? "today" : dayLabel(date)}. Change`}
              className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {date === today ? "Today" : dayLabel(date)}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          {!noteOpen && (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {note ? "Edit note" : "Add note"}
            </button>
          )}
        </div>
        {noteOpen && (
          <Input
            aria-label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            autoFocus
            className="mt-1 h-10 text-sm"
          />
        )}
      </div>

      {/* 3 · Used vs estimated + per-day chart */}
      <div>
        <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
          <span className="font-semibold text-foreground">
            {fmt(used)} / {fmt(estimated)} {unitShort}
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-banner transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        {over > 0 && showOver && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {fmt(over)} {unitWord(line.unit, over)} over estimate
          </p>
        )}

        <p className="sr-only">{summary}</p>
        <div className="mt-3 flex h-16 items-end gap-1" aria-hidden={bars.length === 0}>
          {bars.length === 0
            ? PLACEHOLDER.map((h, i) => <span key={i} className="flex-1 rounded-md bg-muted" style={{ height: `${h}%` }} />)
            : bars.map((b, i) => {
                const latest = i === bars.length - 1;
                return (
                  <Popover key={b.day}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${dayLabel(b.day)}: ${fmt(b.quantity)} ${unitShort}`}
                        className={cn(
                          "bar-grow max-w-8 flex-1 rounded-md transition-[height,background-color] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          latest ? "bg-sidebar-border" : "bg-banner hover:bg-sidebar-border",
                        )}
                        style={{ height: `${Math.max(8, (b.quantity / max) * 100)}%` }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="center">
                      <p className="text-sm font-bold text-foreground">{dayLabel(b.day, { weekday: "short", month: "short", day: "numeric" })}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {fmt(b.quantity)} {unitShort} used
                      </p>
                      <ul className="mt-2 divide-y divide-hairline">
                        {b.entries.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-2 py-1.5">
                            <div className="min-w-0 text-xs">
                              <p className="font-semibold tabular-nums text-foreground">
                                {fmt(Number(e.quantity))} {unitShort}
                                {e.logged_by ? <span className="font-normal text-muted-foreground"> · {e.logged_by}</span> : null}
                              </p>
                              {e.note && <p className="mt-0.5 text-muted-foreground">{e.note}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMut.mutate(e)}
                              disabled={removeMut.isPending}
                              aria-label={`Delete ${fmt(Number(e.quantity))} ${unitShort} entry`}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button type="button" onClick={() => onShowHistory(line)} className="mt-1 text-xs font-semibold text-primary hover:underline">
                        Edit in history
                      </button>
                    </PopoverContent>
                  </Popover>
                );
              })}
        </div>
        {bars.length === 0 && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">No usage logged yet</p>}
      </div>

      {/* 4 · Log */}
      <button
        type="button"
        onClick={() => {
          commitDraft();
          const amount = draft != null ? clampQty(parseFloat(draft)) : qty;
          if (amount > 0) logMut.mutate(amount);
        }}
        disabled={(draft != null ? clampQty(parseFloat(draft)) : qty) <= 0 || logMut.isPending}
        aria-label={`Log ${fmt(qty)} ${unitPlural} of ${label}`}
        className="mt-auto h-12 w-full rounded-full bg-banner text-sm font-bold text-banner-foreground transition-colors hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {logMut.isPending ? "Logging…" : `Log ${fmt(qty)} ${unitPlural}`}
      </button>
    </article>
  );
}

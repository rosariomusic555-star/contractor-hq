import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  createPossibleSub,
  deletePossibleSub,
  listPossibleSubs,
  setPossibleSubCategories,
  updatePossibleSub,
  type Opportunity,
  type PossibleSub,
} from "@/lib/api";
import { SUB_PRESETS, possibleSubsKey, suggestedCategoryFor } from "@/lib/possibleSubs";
import { SubFeaturePicker } from "./SubFeaturePicker";

const TMP = "tmp-";
const tmpId = () => `${TMP}${Math.random().toString(36).slice(2)}`;

/**
 * "Possible subcontracted work" — what the contractor spots at the site
 * visit that someone else will likely do (gas line, electrical…). Preset
 * chips + free text, each with an optional note and the features it serves
 * (several allowed, none = General). Saves as you go (possible_subs rows,
 * 0160), like the notes above it. Shows up as one-tap Subcontractor lines
 * in the Cost plan and (info only) on the crew work order.
 */
export function PossibleSubsSection({
  opportunity,
  jobTypes,
  labelClassName,
}: {
  opportunity: Opportunity;
  /** The opportunity's project types, in order. */
  jobTypes: { id: string; name: string }[];
  labelClassName?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = possibleSubsKey(opportunity.id);
  const { data } = useQuery({ queryKey: key, queryFn: () => listPossibleSubs(opportunity.id) });
  const [subs, setSubs] = useState<PossibleSub[]>([]);
  const [custom, setCustom] = useState("");
  const pending = useRef(0);
  // Server copy changed (saves finished, another tab) — it wins, but never
  // mid-save, so a half-done sequence doesn't flicker back.
  useEffect(() => {
    if (data && pending.current === 0) setSubs(data);
  }, [data]);

  // One save at a time, in click order — quick toggles never race.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = useMutation({
    mutationFn: (op: () => Promise<unknown>) => {
      pending.current += 1;
      const next = queue.current.catch(() => undefined).then(op);
      queue.current = next;
      return next;
    },
    onSettled: async () => {
      pending.current -= 1;
      if (pending.current > 0) return;
      qc.invalidateQueries({ queryKey: ["work-order"] });
      await qc.refetchQueries({ queryKey: key });
      // Re-sync even when the refetch is unchanged (a failed save).
      const fresh = qc.getQueryData<PossibleSub[]>(key);
      if (fresh && pending.current === 0) setSubs(fresh);
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    },
  });

  const add = (kind: string, label: string, category_ids: string[]) => {
    setSubs((list) => [...list, { id: tmpId(), kind, label, note: null, category_ids, lines: [] }]);
    run.mutate(() => createPossibleSub(opportunity.id, { kind, label, category_ids, sort_order: subs.length }));
  };
  const remove = (s: PossibleSub) => {
    setSubs((list) => list.filter((x) => x.id !== s.id));
    run.mutate(() => deletePossibleSub(s.id));
  };
  const setFeatures = (s: PossibleSub, next: string[]) => {
    setSubs((list) => list.map((x) => (x.id === s.id ? { ...x, category_ids: next } : x)));
    run.mutate(() => setPossibleSubCategories(s.id, s.category_ids, next));
  };

  const presetOn = (kind: string) => subs.some((s) => s.kind === kind);
  const togglePreset = (kind: string, label: string) => {
    if (kind === "other") return; // free text below
    const existing = subs.find((s) => s.kind === kind);
    if (existing) {
      if (!existing.id.startsWith(TMP)) remove(existing);
      return;
    }
    const suggested = suggestedCategoryFor(kind, jobTypes);
    add(kind, label, suggested ? [suggested] : []);
  };
  const addCustom = () => {
    const label = custom.trim();
    if (!label) return;
    setCustom("");
    add("custom", label, []);
  };
  const patch = (id: string, p: Partial<PossibleSub>) => setSubs((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  /** Label / note edits save on blur, only when they changed. */
  const persist = (s: PossibleSub) => {
    const server = data?.find((x) => x.id === s.id);
    if (!server) return;
    const label = s.label.trim() || server.label;
    if (label === server.label && (s.note ?? null) === (server.note ?? null)) return;
    run.mutate(() => updatePossibleSub(s.id, { label, note: s.note ?? null }));
  };

  return (
    <div className="space-y-2">
      <div>
        <div className={labelClassName}>Possible subcontracted work</div>
        <p className="text-xs text-muted-foreground">
          Anything someone else will likely handle. It shows up as a suggested Subcontractor line in the Cost plan.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUB_PRESETS.filter((p) => p.kind !== "other").map((p) => {
          const on = presetOn(p.kind);
          return (
            <button
              key={p.kind}
              type="button"
              aria-pressed={on}
              onClick={() => togglePreset(p.kind, p.label)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                on ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {on ? null : <Plus className="h-3.5 w-3.5" />}
              {p.label}
            </button>
          );
        })}
      </div>

      {subs.length > 0 && (
        <ul className="space-y-2">
          {subs.map((s) => {
            const pending = s.id.startsWith(TMP);
            return (
              <li key={s.id} className="rounded-xl border border-hairline p-2.5">
                {/* Phones: name + remove on one line, the picker full width below. */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  {s.kind === "custom" ? (
                    <Input
                      value={s.label}
                      disabled={pending}
                      onChange={(e) => patch(s.id, { label: e.target.value })}
                      onBlur={() => persist(s)}
                      aria-label="Subcontracted item"
                      className="h-9 w-0 min-w-0 flex-1 font-semibold"
                    />
                  ) : (
                    <span className="w-0 min-w-0 flex-1 truncate text-sm font-bold text-foreground">{s.label}</span>
                  )}
                  <SubFeaturePicker
                    label={s.label}
                    value={s.category_ids}
                    features={jobTypes}
                    onChange={(next) => !pending && setFeatures(s, next)}
                    className="order-last w-full sm:order-none sm:w-64"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(s)}
                    aria-label={`Remove ${s.label}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-subtle hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  value={s.note ?? ""}
                  disabled={pending}
                  onChange={(e) => patch(s.id, { note: e.target.value || null })}
                  onBlur={() => persist(s)}
                  placeholder="Note (optional) — e.g. 40 ft run from meter on the east side"
                  aria-label={`${s.label} note`}
                  className="mt-2 h-9 text-sm"
                />
                {s.lines.length > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Added to cost plan
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="Something else? e.g. Fence removal"
          aria-label="Add other subcontracted work"
          className="h-9 text-sm"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}

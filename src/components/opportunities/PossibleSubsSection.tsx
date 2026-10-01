import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { savePossibleSubs, type Opportunity, type PossibleSub } from "@/lib/api";
import { SUB_PRESETS, suggestedCategoryFor } from "@/lib/possibleSubs";

const GENERAL = "__general__";
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/**
 * "Possible subcontracted work" — what the contractor spots at the site
 * visit that someone else will likely do (gas line, electrical…). Preset
 * chips + free text, each with an optional note and the project type it
 * belongs to. Saves as you go (opportunities.possible_subs, 0155), like the
 * notes above it. Shows up as one-tap Subcontractor lines in the Cost plan
 * and (info only) on the crew work order.
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
  const [subs, setSubs] = useState<PossibleSub[]>(opportunity.possible_subs ?? []);
  const [custom, setCustom] = useState("");
  // Server copy changed (another tab, a refetch) and nothing pending here.
  useEffect(() => setSubs(opportunity.possible_subs ?? []), [opportunity.possible_subs]);

  const save = useMutation({
    mutationFn: (next: PossibleSub[]) => savePossibleSubs(opportunity.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opportunity", opportunity.id] }),
    onError: (e: Error) => {
      setSubs(opportunity.possible_subs ?? []);
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    },
  });
  const commit = (next: PossibleSub[]) => {
    setSubs(next);
    save.mutate(next);
  };

  const presetOn = (kind: string) => subs.some((s) => s.kind === kind);
  const togglePreset = (kind: string, label: string) => {
    if (kind === "other") return; // free text below
    if (presetOn(kind)) commit(subs.filter((s) => s.kind !== kind));
    else commit([...subs, { id: newId(), kind, label, note: null, category_id: suggestedCategoryFor(kind, jobTypes) }]);
  };
  const addCustom = () => {
    const label = custom.trim();
    if (!label) return;
    setCustom("");
    commit([...subs, { id: newId(), kind: "custom", label, note: null, category_id: null }]);
  };
  const patch = (id: string, p: Partial<PossibleSub>) => setSubs((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const persist = () => {
    const server = JSON.stringify(opportunity.possible_subs ?? []);
    if (JSON.stringify(subs) !== server) save.mutate(subs);
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
          {subs.map((s) => (
            <li key={s.id} className="rounded-xl border border-hairline p-2.5">
              <div className="flex items-center gap-2">
                {s.kind === "custom" ? (
                  <Input
                    value={s.label}
                    onChange={(e) => patch(s.id, { label: e.target.value })}
                    onBlur={persist}
                    aria-label="Subcontracted item"
                    className="h-9 flex-1 font-semibold"
                  />
                ) : (
                  <span className="flex-1 text-sm font-bold text-foreground">{s.label}</span>
                )}
                <Select
                  value={s.category_id ?? GENERAL}
                  onValueChange={(v) => commit(subs.map((x) => (x.id === s.id ? { ...x, category_id: v === GENERAL ? null : v } : x)))}
                >
                  <SelectTrigger className="h-9 w-40 text-xs sm:w-48" aria-label={`${s.label} goes with`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL}>General</SelectItem>
                    {jobTypes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {s.category_id && !jobTypes.some((c) => c.id === s.category_id) && (
                      <SelectItem value={s.category_id}>Type no longer on the job</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => commit(subs.filter((x) => x.id !== s.id))}
                  aria-label={`Remove ${s.label}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-subtle hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={s.note ?? ""}
                onChange={(e) => patch(s.id, { note: e.target.value || null })}
                onBlur={persist}
                placeholder="Note (optional) — e.g. 40 ft run from meter on the east side"
                aria-label={`${s.label} note`}
                className="mt-2 h-9 text-sm"
              />
            </li>
          ))}
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

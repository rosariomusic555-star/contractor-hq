import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceMark } from "@/components/common/ChoiceMark";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  deleteSelectionGroup,
  getSignedImageUrls,
  setContractorSelectionPicks,
  type MaterialsItem,
  type ProductCatalogItem,
  type QuoteSelectionGroup,
  type SelectionGroupDraft,
} from "@/lib/api";
import { effectiveOptions, groupCost, groupFromRows, groupPrice, optionMarginImpact, priceLabel, selectionRange } from "@/lib/selections";
import { SelectionGroupDialog } from "./SelectionGroupDialog";

const PICKED_BY: Record<string, string> = { client: "Client picked", contractor: "You picked", default: "Default", change_order: "Changed by CO" };

/**
 * A quote section's client selections, contractor side (0115): each group
 * with its options, the client's current picks (or pick on their behalf
 * before approval), and — internal — the price range and each option's
 * margin impact. Locked with "Approved on …" once the quote is approved.
 */
export function QuoteSectionSelections({
  quoteSectionId,
  groups,
  approved,
  linkableLines,
  catalogItems,
  onChanged,
  editing,
  setEditing,
  templateSeed,
}: {
  quoteSectionId: string;
  groups: QuoteSelectionGroup[];
  approved: boolean;
  linkableLines: MaterialsItem[];
  catalogItems: ProductCatalogItem[];
  onChanged: () => void;
  /** "new" | a group id | null — the dialog, driven by the toolbar too. */
  editing: string | null;
  setEditing: (v: string | null) => void;
  templateSeed?: Partial<SelectionGroupDraft> | null;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const paths = groups.flatMap((g) => (g.quote_selection_options ?? []).map((o) => o.image_path).filter(Boolean) as string[]);
  const { data: urls = {} } = useQuery({
    queryKey: ["selection-image-urls", paths.join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
  });
  const pick = useMutation({
    mutationFn: ({ groupId, ids }: { groupId: string; ids: string[] }) => setContractorSelectionPicks(groupId, ids),
    onMutate: ({ groupId }) => setBusy(groupId),
    onSettled: () => setBusy(null),
    onSuccess: onChanged,
    onError: (err: Error) => toast({ title: "Couldn't save the pick", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: deleteSelectionGroup,
    onSuccess: () => {
      toast({ title: "Selection removed" });
      onChanged();
    },
    onError: (err: Error) => toast({ title: "Couldn't remove", description: err.message, variant: "destructive" }),
  });

  const likes = groups.map(groupFromRows);
  const range = selectionRange(likes);
  const editingGroup = editing && editing !== "new" ? groups.find((g) => g.id === editing) ?? null : null;

  return (
    <>
      {groups.length > 0 && (
        <div className="mt-3 space-y-2 rounded-2xl border border-info/25 bg-info/5 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Client selections</span>
            <span className="text-[11px] text-muted-foreground">
              Now {formatCurrency(likes.reduce((s, g) => s + groupPrice(g), 0))}
              {range.min !== range.max && ` · range ${formatCurrency(range.min)} – ${formatCurrency(range.max)}`}
              <span className="ml-1 text-muted-subtle">(internal)</span>
            </span>
          </div>
          {groups.map((g) => {
            const like = groupFromRows(g);
            const picks = g.quote_selection_picks ?? [];
            const chosen = effectiveOptions(like).map((o) => o.id);
            const by = picks[0]?.picked_by;
            const toggle = (id: string) => {
              if (approved) return;
              const next = g.multi ? (chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]) : [id];
              pick.mutate({ groupId: g.id, ids: next });
            };
            return (
              <div key={g.id} className="rounded-xl bg-card p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-foreground">{g.name}</span>
                    <span className="ml-1.5 text-[11px] text-muted-subtle">
                      {g.required ? "Required" : "Optional"}
                      {g.multi ? " · select all that apply" : " · pick one"}
                    </span>
                    <div className="text-[11px] text-muted-foreground">
                      {approved ? (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Approved{g.approved_at ? ` on ${new Date(g.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                        </span>
                      ) : picks.length ? (
                        `${PICKED_BY[by ?? "client"]} — tap to pick on the client's behalf`
                      ) : (
                        "Client hasn't chosen yet — tap to pick on their behalf"
                      )}
                    </div>
                  </div>
                  {!approved && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(g.id)} aria-label={`Edit ${g.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(g.id)} aria-label={`Remove ${g.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" role={g.multi ? "group" : "radiogroup"} aria-label={g.name}>
                  {(g.quote_selection_options ?? []).map((o) => {
                    const on = chosen.includes(o.id);
                    const impact = optionMarginImpact({ ...o, price_delta: Number(o.price_delta), cost_delta: Number(o.cost_delta) } as never);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={approved || busy === g.id}
                        onClick={() => toggle(o.id)}
                        role={g.multi ? "checkbox" : "radio"}
                        aria-checked={on}
                        className={cn(
                          "flex min-h-9 items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs",
                          on ? "border-primary bg-primary/10" : "border-border",
                          approved && !on && "opacity-50",
                        )}
                        title={o.link_item_id ? "Changes a Cost plan line on approval" : undefined}
                      >
                        <ChoiceMark multi={g.multi} checked={on} />
                        {o.image_path && urls[o.image_path] && <img src={urls[o.image_path]} alt="" className="h-6 w-6 rounded object-cover" />}
                        <span className="font-semibold text-foreground">{o.name}</span>
                        <span className="text-muted-foreground">{priceLabel(Number(o.price_delta))}</span>
                        {o.is_default && <span className="text-[10px] text-muted-subtle">default</span>}
                        {(Number(o.cost_delta) !== 0 || Number(o.price_delta) !== 0) && (
                          <span className={cn("text-[10px] font-semibold", impact < 0 ? "text-destructive" : "text-success")}>
                            margin {impact >= 0 ? "+" : "−"}
                            {formatCurrency(Math.abs(impact))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {groupCost(like) !== 0 && !approved && (
                  <p className="mt-1 text-[11px] text-muted-subtle">Internal cost adjustment now: {formatCurrency(groupCost(like))}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <SelectionGroupDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        quoteSectionId={quoteSectionId}
        group={editingGroup}
        initial={editing === "new" ? templateSeed ?? null : null}
        sortOrder={groups.length}
        linkableLines={linkableLines}
        catalogItems={catalogItems}
        onSaved={onChanged}
      />
    </>
  );
}

import { useState } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { ChoiceMark } from "@/components/common/ChoiceMark";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { priceLabel } from "@/lib/selections";
import type { PortalSelectionGroup } from "@/lib/portalApi";

/**
 * Client Selections as the client sees them (Client Hub, the share link,
 * the contractor's preview): each group as option cards — photo, name,
 * description, price label ("Included", "+$1,250", "−$200"). Big tap
 * targets; tap a photo to enlarge. `picks` are the in-progress choices by
 * group id; a required group with nothing chosen is flagged.
 */
export function ClientSelectionGroups({
  groups,
  picks,
  onChange,
  imageUrls = {},
  locked = false,
  flagMissing = false,
  footer,
}: {
  groups: PortalSelectionGroup[];
  picks: Record<string, string[]>;
  onChange?: (groupId: string, optionIds: string[]) => void;
  imageUrls?: Record<string, string>;
  locked?: boolean;
  flagMissing?: boolean;
  /** Per-group extra (e.g. "Request a change" once approved). */
  footer?: (g: PortalSelectionGroup) => React.ReactNode;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!groups.length) return null;
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const chosen = picks[g.id] ?? g.picked ?? [];
        const effective = chosen.length ? chosen : g.options.filter((o) => o.is_default).map((o) => o.id);
        const missing = g.required && effective.length === 0;
        const toggle = (id: string) => {
          if (locked || !onChange) return;
          if (g.multi) onChange(g.id, effective.includes(id) ? effective.filter((x) => x !== id) : [...effective, id]);
          else onChange(g.id, effective.includes(id) && !g.required ? [] : [id]);
        };
        return (
          <fieldset key={g.id} className={cn("rounded-xl border p-3", missing && flagMissing ? "border-destructive/50 bg-destructive/5" : "border-border")}>
            <legend className="px-1 text-sm font-bold text-foreground">
              {g.name}
              <span className="ml-1.5 text-[11px] font-semibold text-muted-subtle">
                {g.required ? "Required" : "Optional"}
                {g.multi ? " · select all that apply" : ""}
              </span>
            </legend>
            {g.help_text && <p className="mb-2 text-xs text-muted-foreground">{g.help_text}</p>}
            {locked && g.approved_at && (
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" />
                Approved on {new Date(g.approved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
            {missing && flagMissing && (
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                Please choose one
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role={g.multi ? "group" : "radiogroup"} aria-label={g.name}>
              {g.options.map((o) => {
                const on = effective.includes(o.id);
                const url = o.image_path ? imageUrls[o.image_path] : null;
                if (locked && !on) return null;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "flex min-h-[64px] items-stretch overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                      on ? "border-primary bg-primary/5" : "border-border",
                      !locked && onChange && "cursor-pointer hover:border-primary/50",
                    )}
                  >
                    {url && (
                      <button type="button" onClick={() => setZoom(url)} className="w-20 shrink-0 bg-muted" aria-label={`Enlarge photo of ${o.name}`}>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    )}
                    <button
                      type="button"
                      role={g.multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      disabled={locked || !onChange}
                      onClick={() => toggle(o.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 p-3 text-left disabled:cursor-default"
                    >
                      <ChoiceMark multi={g.multi} checked={on} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{o.name}</span>
                          <span className={cn("shrink-0 text-xs font-bold", o.price_delta < 0 ? "text-success" : o.price_delta > 0 ? "text-foreground" : "text-muted-foreground")}>
                            {priceLabel(o.price_delta)}
                          </span>
                        </span>
                        {o.description && <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            {footer?.(g)}
          </fieldset>
        );
      })}
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-2xl p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {zoom && <img src={zoom} alt="" className="max-h-[80vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Ruler } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrefillSource } from "@/lib/measurements";

/**
 * "From site measurements" banner at the top of the Smart Section
 * calculator and Quick Quote. With several instances (two patios…) it's a
 * picker: one of them, or all combined. Picking re-fills the size
 * questions; everything stays editable. Renders nothing when the project
 * has no matching measurements.
 */
export function MeasurementPrefillPicker({
  sources,
  selected,
  onSelect,
}: {
  sources: PrefillSource[];
  selected: PrefillSource | null;
  onSelect: (id: string) => void;
}) {
  if (sources.length === 0 || !selected) return null;
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
        <Ruler className="h-3.5 w-3.5 text-primary" /> From site measurements
      </p>
      {sources.length > 1 ? (
        <Select value={selected.id} onValueChange={onSelect}>
          <SelectTrigger className="h-11 bg-card text-sm" aria-label="Which measurement to use">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-h-11">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm font-semibold text-foreground">{selected.label}</p>
      )}
      <p className="text-xs text-muted-foreground">Size filled in below — edit anything before you run it.</p>
    </div>
  );
}

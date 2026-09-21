import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RANGE_PRESETS, type RangeKey } from "@/lib/revenue";

/** The one date-range control every Revenue detail page shares — This
 * month / Last 3 months / Last 12 months / Year to date / Custom. */
export function DateRangeSelect({
  value,
  customStart,
  customEnd,
  onChange,
  onCustomChange,
}: {
  value: RangeKey;
  customStart: string;
  customEnd: string;
  onChange: (key: RangeKey) => void;
  onCustomChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={(v) => onChange(v as RangeKey)}>
        <SelectTrigger className="h-9 w-[170px] bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      {value === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={customStart}
            onChange={(e) => onCustomChange(e.target.value, customEnd)}
            className="h-9 w-[150px]"
          />
          <span className="text-muted-subtle">–</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomChange(customStart, e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
      )}
    </div>
  );
}

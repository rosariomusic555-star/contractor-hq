import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLeadSources } from "@/lib/api";

// Radix Select can't use "" as an item value — this stands in for "no source".
const NONE = "__none__";

/**
 * The one lead-source dropdown — used by the New opportunity dialog and the
 * opportunity page's Details card, so both always read the same per-
 * contractor list (lead_sources, Settings > Lead sources). The stored value
 * is still plain text on opportunities.lead_source (0077), so a saved value
 * that's no longer in the list (renamed/deleted source, or a pre-0077 free-
 * text entry) is kept as an extra option rather than rendering blank.
 */
export function LeadSourceSelect({
  value,
  onChange,
  placeholder = "Select a source",
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const { data: leadSources = [], isLoading } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });
  const names = leadSources.map((s) => s.name);
  const current = value?.trim() || null;
  const options = current && !names.includes(current) ? [...names, current] : names;

  return (
    <Select value={current ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {options.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        {!isLoading && names.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No lead sources yet —{" "}
            <Link to="/settings/lead-sources" className="font-semibold text-primary hover:underline">
              add some in Settings
            </Link>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCrews } from "@/lib/api";

const NONE = "__none";

/** Pick the job's crew (0120). The rain-delay cascade shifts only the same
 * crew's jobs; "No crew" jobs are never cascaded. */
export function CrewSelect({ value, onChange, className }: { value: string | null | undefined; onChange: (crewId: string | null) => void; className?: string }) {
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className={className} aria-label="Crew">
        <SelectValue placeholder="No crew" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No crew</SelectItem>
        {crews.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <Link to="/settings/team" className="block px-2 py-1.5 text-xs font-semibold text-primary hover:text-primary/80">
          Manage crews
        </Link>
      </SelectContent>
    </Select>
  );
}

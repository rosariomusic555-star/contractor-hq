import { Link } from "react-router-dom";
import { ChevronRight, Briefcase } from "lucide-react";
import type { PortalProject } from "@/lib/portalApi";

/** Shown when a signed-in client has more than one project — across one
 * contractor, or (since clients.email isn't unique) more than one. */
export function PortalProjectPicker({
  projects,
}: {
  projects: (PortalProject & { business_name: string | null })[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Your projects</h1>
      <div className="card-surface divide-y divide-hairline overflow-hidden !p-0">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/portal/projects/${p.id}`}
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
              {p.business_name && (
                <span className="block truncate text-xs text-muted-foreground">{p.business_name}</span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}

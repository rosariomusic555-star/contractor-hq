import { cn } from "@/lib/utils";
import type { StatusMeta } from "@/lib/statusMeta";

/** Renders a status pill from a `StatusMeta` (see `src/lib/statusMeta.ts`). */
export function StatusPill({ meta, className }: { meta: StatusMeta; className?: string }) {
  return <span className={cn(meta.badge, className)}>{meta.label}</span>;
}

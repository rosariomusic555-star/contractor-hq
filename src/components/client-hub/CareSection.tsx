import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { portalMaintenanceOptOut, portalRequestService, type PortalProjectDetail } from "@/lib/portalApi";
import { MONTHS } from "@/lib/maintenance";

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * Client Hub "Care & maintenance" (0127) — completed jobs only: what to do
 * and roughly when, warranty end dates, "Request service" (opens a pipeline
 * opportunity + notifies the contractor) and "Don't remind me". No prices;
 * built only from the whitelisted `care` block. Read-only in Client view.
 */
export function CareSection({ detail, projectId, interactive }: { detail: PortalProjectDetail; projectId: string; interactive: boolean }) {
  const qc = useQueryClient();
  const care = detail.care;
  const [requested, setRequested] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
    qc.invalidateQueries({ queryKey: ["client-view", projectId] });
  };
  const request = useMutation({ mutationFn: () => portalRequestService(projectId), onSuccess: () => setRequested(true) });
  const optOut = useMutation({ mutationFn: (v: boolean) => portalMaintenanceOptOut(projectId, v), onSuccess: refresh });

  if (!care || (care.items.length === 0 && care.warranties.length === 0)) return null;

  return (
    <section className="card-surface space-y-4 p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Wrench className="h-4 w-4 text-muted-foreground" /> Care & maintenance
      </h3>

      {care.items.length > 0 && (
        <ul className="space-y-3">
          {care.items.map((i, n) => (
            <li key={n} className="rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-bold text-foreground">
                {i.label}
                {i.feature && <span className="font-normal text-muted-foreground"> · {i.feature}</span>}
              </p>
              {i.description && <p className="mt-0.5 text-sm text-muted-foreground">{i.description}</p>}
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {i.as_needed || !i.next_month ? "As needed" : `Next suggested: ${monthLabel(i.next_month)}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {care.warranties.length > 0 && (
        <div className="space-y-1">
          {care.warranties.map((w, n) => (
            <p key={n} className="flex items-center gap-1.5 text-sm text-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              {w.feature} warranty until {dayLabel(w.ends_on)}
            </p>
          ))}
        </div>
      )}

      {requested ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">Thanks — we got your request and will be in touch.</p>
      ) : (
        <Button className="h-11 w-full sm:w-auto" disabled={!interactive || request.isPending} onClick={() => request.mutate()}>
          Request service
        </Button>
      )}
      {request.isError && <p className="text-sm text-destructive">Couldn't send that — please try again.</p>}

      {care.items.length > 0 && (
        <label className="flex items-start gap-2 border-t border-hairline pt-3 text-sm text-foreground">
          <Checkbox className="mt-0.5" disabled={!interactive || optOut.isPending} checked={care.opted_out} onCheckedChange={(v) => optOut.mutate(v === true)} />
          Don't remind me about maintenance (this info stays here).
        </label>
      )}
    </section>
  );
}

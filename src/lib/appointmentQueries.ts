import type { QueryClient } from "@tanstack/react-query";

/** Everything an appointment change can touch. Creating, editing, completing
 * or cancelling a site visit can move its opportunity's stage (see
 * createAppointment/updateAppointment in api.ts), so the opportunity, the
 * pipeline board and the activity timelines refresh too. */
export function invalidateAppointmentQueries(
  qc: QueryClient,
  clientId: string | null | undefined,
  opportunityId: string | null | undefined,
) {
  qc.invalidateQueries({ queryKey: ["appointments"] });
  if (clientId) qc.invalidateQueries({ queryKey: ["client-appointments", clientId] });
  if (opportunityId) {
    qc.invalidateQueries({ queryKey: ["opportunity-appointments", opportunityId] });
    qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
    qc.invalidateQueries({ queryKey: ["opportunity-activities", opportunityId] });
    qc.invalidateQueries({ queryKey: ["opportunities"] });
  }
  qc.invalidateQueries({ queryKey: ["activities"] });
}

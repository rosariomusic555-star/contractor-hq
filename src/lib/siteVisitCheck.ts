import { SITE_VISIT_APPOINTMENT_TYPES, type Appointment, type Opportunity, type OpportunityStage } from "./api";
import { appointmentHasPassed, appointmentWhenLabel } from "./appointmentTime";

// Stages where confirming the visit still moves the lead forward (to Site
// Visit Done). Past these the visit is moot, so no prompt — this matches
// the forward-only auto-advance in api.ts.
const CONFIRMABLE_STAGES: OpportunityStage[] = ["new_lead", "contacted", "site_visit_scheduled"];

type VisitFields = Pick<Appointment, "opportunity_id" | "type" | "status" | "date_time" | "all_day">;

/**
 * The site visit / estimate appointment an opportunity needs confirmed:
 * still `scheduled` (not completed or cancelled) and already past — a timed
 * visit once its start time has passed, a date-only one (older, 0092) from
 * the day after (appointmentHasPassed). Oldest first if there are several.
 * Undefined once it's completed, cancelled or moved later — which is what
 * makes the prompt disappear everywhere. Single
 * source for the StageBanner, the Needs-you queue and the Pipeline board.
 */
export function overdueSiteVisit<A extends VisitFields>(
  opportunity: Pick<Opportunity, "id" | "stage">,
  appointments: A[],
  now: Date = new Date(),
): A | undefined {
  if (!CONFIRMABLE_STAGES.includes(opportunity.stage)) return undefined;
  return appointments
    .filter(
      (a) =>
        a.opportunity_id === opportunity.id &&
        a.status === "scheduled" &&
        SITE_VISIT_APPOINTMENT_TYPES.includes(a.type) &&
        appointmentHasPassed(a, now),
    )
    .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];
}

/** overdueSiteVisit() for every opportunity at once, keyed by opportunity id. */
export function overdueSiteVisitsByOpportunity<A extends VisitFields>(
  opportunities: Pick<Opportunity, "id" | "stage">[],
  appointments: A[],
  now: Date = new Date(),
): Map<string, A> {
  const byOpp = new Map<string, A[]>();
  for (const a of appointments) {
    if (!a.opportunity_id) continue;
    const list = byOpp.get(a.opportunity_id);
    if (list) list.push(a);
    else byOpp.set(a.opportunity_id, [a]);
  }
  const result = new Map<string, A>();
  for (const o of opportunities) {
    const visit = overdueSiteVisit(o, byOpp.get(o.id) ?? [], now);
    if (visit) result.set(o.id, visit);
  }
  return result;
}

/** "Fri, Sep 25 · 9:30 AM" (just the date for a date-only visit). */
export const siteVisitDateLabel = (a: Pick<Appointment, "date_time" | "all_day">) => appointmentWhenLabel(a);

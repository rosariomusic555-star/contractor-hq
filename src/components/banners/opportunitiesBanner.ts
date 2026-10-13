import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Sprout, Target, Trophy } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import {
  listAppointments,
  listOpportunityLastActivity,
  listQuotes,
  pickHeadlineQuote,
  quoteTotal,
  type Appointment,
  type Opportunity,
  type Quote,
} from "@/lib/api";
import { OPPORTUNITY_STAGE_META, TONE_SOLID_CLASS } from "@/lib/statusMeta";
import { changeLabel, compactMoney, count, daysBetween, inLastDays, inMonth, inWeek, monthlySeries, pct, winRate } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

export type OpportunityChip = "stale" | "appt_week" | "estimate" | "won_month";

type Opp = Pick<Opportunity, "id" | "stage" | "created_at" | "updated_at" | "lead_source" | "project_id">;

const OPEN_STAGES = ["new_lead", "contacted", "site_visit_scheduled", "site_visit_done", "proposal_sent", "revisions"] as const;
const isOpen = (o: Pick<Opportunity, "stage">) => o.stage !== "won" && o.stage !== "lost";

/** When a win happened: its signed original quote, else the last update
 *  (opportunities don't store a won date — same rule as Business health). */
function wonOn(o: Opp, quotesByProject: Map<string, Quote[]>): string {
  const q = (o.project_id ? quotesByProject.get(o.project_id) ?? [] : []).find((x) => x.kind !== "addon" && x.status === "approved" && x.signed_at);
  return q?.signed_at ?? o.updated_at;
}

export function opportunityBannerStats(
  opps: Opp[],
  quotes: Quote[],
  appointments: Pick<Appointment, "opportunity_id" | "date_time" | "status">[],
  lastActivity: Map<string, string>,
  now: Date,
) {
  const quotesByProject = new Map<string, Quote[]>();
  for (const q of quotes) if (q.project_id) quotesByProject.set(q.project_id, [...(quotesByProject.get(q.project_id) ?? []), q]);
  const valueOf = (o: Opp) => {
    const h = o.project_id ? pickHeadlineQuote(quotesByProject.get(o.project_id) ?? []) : null;
    return h ? quoteTotal(h.quote_sections) : null;
  };
  const lastOf = (o: Opp) => {
    const l = lastActivity.get(o.id);
    return l && l > o.updated_at ? l : o.updated_at;
  };
  const apptWeek = new Set(appointments.filter((a) => a.opportunity_id && a.status === "scheduled" && inWeek(a.date_time, now)).map((a) => a.opportunity_id!));

  const match = (o: Opp, chip: OpportunityChip) => {
    switch (chip) {
      case "stale":
        return isOpen(o) && daysBetween(lastOf(o), now) >= 7;
      case "appt_week":
        return isOpen(o) && apptWeek.has(o.id);
      case "estimate":
        return o.stage === "site_visit_done" && valueOf(o) == null;
      case "won_month":
        return o.stage === "won" && inMonth(wonOn(o, quotesByProject), now);
    }
  };
  const open = opps.filter(isOpen);
  const won90 = opps.filter((o) => o.stage === "won" && inLastDays(wonOn(o, quotesByProject), 90, now)).length;
  const lost90 = opps.filter((o) => o.stage === "lost" && inLastDays(o.updated_at, 90, now)).length;
  const sources = new Map<string, number>();
  for (const o of opps) if (o.lead_source) sources.set(o.lead_source, (sources.get(o.lead_source) ?? 0) + 1);
  const topSource = [...sources.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const chip = (c: OpportunityChip) => opps.filter((o) => match(o, c)).length;
  return {
    total: opps.length,
    openCount: open.length,
    openValue: open.reduce((s, o) => s + (valueOf(o) ?? 0), 0),
    byStage: OPEN_STAGES.map((st) => ({ stage: st, n: open.filter((o) => o.stage === st).length })),
    newMonth: opps.filter((o) => inMonth(o.created_at, now)).length,
    newLastMonth: opps.filter((o) => inMonth(o.created_at, now, -1)).length,
    newSeries: monthlySeries(opps, (o) => o.created_at, () => 1, now),
    won90,
    lost90,
    winRate: winRate(won90, lost90),
    topSource,
    match,
    chips: { stale: chip("stale"), appt_week: chip("appt_week"), estimate: chip("estimate"), won_month: chip("won_month") },
  };
}

/**
 * The Opportunities list and the Pipeline board share this banner.
 * `onChip` / `onTile` let each page apply it to its own view; `opportunities`
 * are the live (not archived) ones, won and lost included.
 */
export function useOpportunitiesBanner({
  opportunities,
  loading,
  chip,
  onChip,
  onTile,
}: {
  opportunities: Opp[];
  loading: boolean;
  chip: OpportunityChip | null;
  onChip: (c: OpportunityChip | null) => void;
  /** A tile was clicked — "open" | "new" | "won" | "source" (+ the source). */
  onTile?: (t: "open" | "new" | "won" | "source", source?: string) => void;
}): { rich: RichBanner; matches: (o: Opp) => boolean } {
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: lastActivity = new Map<string, string>() } = useQuery({ queryKey: ["opportunity-last-activity"], queryFn: listOpportunityLastActivity });
  const now = new Date();
  const st = useMemo(() => opportunityBannerStats(opportunities, quotes, appointments, lastActivity, new Date()), [opportunities, quotes, appointments, lastActivity]);

  const insight =
    st.total === 0
      ? "No opportunities yet — add your first lead"
      : [`${st.openCount} open`, st.openValue > 0 ? `${compactMoney(st.openValue)} in play` : null, st.newMonth ? `${count(st.newMonth, "new lead")} this month` : null].filter(Boolean).join(" · ");

  const rich: RichBanner = {
    insight,
    loading,
    listId: "opportunities-list",
    activeChip: chip,
    onChip: (k) => onChip(k as OpportunityChip | null),
    chips: [
      { key: "stale", label: "no activity in 7+ days", count: st.chips.stale },
      { key: "appt_week", label: st.chips.appt_week === 1 ? "appointment this week" : "with appointments this week", count: st.chips.appt_week },
      { key: "estimate", label: "estimate needed", count: st.chips.estimate },
      { key: "won_month", label: "won this month", count: st.chips.won_month },
    ],
    tiles: [
      {
        key: "open",
        label: "Open",
        icon: Target,
        value: st.openCount ? formatCurrency(st.openValue) : "—",
        sub: st.openCount ? `${count(st.openCount, "opportunity", "opportunities")}${st.openValue ? "" : " · no quotes yet"}` : "Add a lead to see this",
        visual: st.openCount
          ? {
              kind: "segments",
              parts: st.byStage.map((b) => ({
                label: OPPORTUNITY_STAGE_META[b.stage].label,
                value: b.n,
                className: TONE_SOLID_CLASS[OPPORTUNITY_STAGE_META[b.stage].tone].split(" ")[0],
              })),
            }
          : undefined,
        onClick: onTile ? () => onTile("open") : undefined,
      },
      {
        key: "new",
        label: "New leads this month",
        icon: Sprout,
        value: st.total ? String(st.newMonth) : "—",
        sub: changeLabel(st.newMonth, st.newLastMonth, "last month") ?? (st.total ? "none last month" : "New leads show here"),
        visual: st.newSeries.some((v) => v > 0) ? { kind: "spark", points: st.newSeries } : undefined,
        onClick: onTile ? () => onTile("new") : undefined,
      },
      {
        key: "win",
        label: "Win rate, 90 days",
        icon: Trophy,
        value: st.winRate == null ? "—" : pct(st.winRate),
        sub: st.winRate == null ? "Shows once deals are won or lost" : `${st.won90} won · ${st.lost90} lost`,
        visual: st.winRate == null ? undefined : { kind: "progress", value: st.winRate },
        onClick: onTile ? () => onTile("won") : undefined,
      },
      {
        key: "source",
        label: "Top lead source",
        icon: Megaphone,
        value: st.topSource ? st.topSource[0] : "—",
        sub: st.topSource ? `${count(st.topSource[1], "opportunity", "opportunities")}, all time` : "Set a lead source on your leads",
        onClick: onTile && st.topSource ? () => onTile("source", st.topSource![0]) : undefined,
      },
    ],
  };
  return { rich, matches: (o) => !chip || st.match(o, chip) };
}

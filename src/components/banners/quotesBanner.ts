import { useQuery } from "@tanstack/react-query";
import { Calculator, CircleCheck, Send, Trophy } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { QUOTE_DEFAULTS_FALLBACK, getQuoteDefaults, quoteTotal, type NotificationSettings, type Quote } from "@/lib/api";
import { coldState } from "@/lib/quoteActivity";
import { changeLabel, compactMoney, count, daysBetween, inLastDays, inMonth, inNextDays, monthlySeries, pct, winRate } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

type QuoteRow = Pick<Quote, "status" | "sent_at" | "signed_at" | "declined_at" | "created_at" | "view_count" | "first_viewed_at" | "last_viewed_at" | "last_view_device" | "selections_changed_at" | "quote_sections">;

export type QuoteChip = "cold" | "expiring" | "drafts" | "viewed";

/** Valid-until date — created + the quote-validity days (Settings › Quote
 *  defaults), the same rule QuoteWorkspace shows. */
export function quoteValidUntil(q: Pick<Quote, "created_at">, validityDays: number): Date {
  return new Date(new Date(q.created_at).getTime() + validityDays * 86_400_000);
}

/** Which attention chip a quote falls under. */
export function quoteChipMatch(q: QuoteRow, chip: QuoteChip, settings: Pick<NotificationSettings, "cold_unopened_days" | "cold_unsigned_days">, validityDays: number, now: Date): boolean {
  switch (chip) {
    case "cold":
      return coldState(q, settings, now) != null;
    case "expiring": {
      if (q.status !== "sent") return false;
      const until = quoteValidUntil(q, validityDays);
      const d = daysBetween(now, until);
      return d >= 0 && d < 7;
    }
    case "drafts":
      return q.status === "draft";
    case "viewed":
      return q.status === "sent" && (q.view_count ?? 0) > 0;
  }
}

/** Everything the Quotes banner shows, from the quote list. */
export function quoteBannerStats(quotes: QuoteRow[], settings: Pick<NotificationSettings, "cold_unopened_days" | "cold_unsigned_days">, validityDays: number, now: Date) {
  const rows = quotes.map((q) => ({ q, total: quoteTotal(q.quote_sections) }));
  const sent = rows.filter((x) => x.q.status === "sent");
  const approvedMonth = rows.filter((x) => x.q.status === "approved" && inMonth(x.q.signed_at, now));
  const won90 = rows.filter((x) => x.q.status === "approved" && inLastDays(x.q.signed_at, 90, now)).length;
  const lost90 = rows.filter((x) => x.q.status === "declined" && inLastDays(x.q.declined_at, 90, now)).length;
  const sentIn = (from: number, to: number) => rows.filter((x) => x.total > 0 && x.q.sent_at && daysBetween(x.q.sent_at, now) >= from && daysBetween(x.q.sent_at, now) < to);
  const avg = (xs: { total: number }[]) => (xs.length ? xs.reduce((s, x) => s + x.total, 0) / xs.length : null);
  const recent = sentIn(0, 90);
  const prior = sentIn(90, 180);
  const chip = (c: QuoteChip) => quotes.filter((q) => quoteChipMatch(q, c, settings, validityDays, now)).length;
  return {
    total: quotes.length,
    sentCount: sent.length,
    sentValue: sent.reduce((s, x) => s + x.total, 0),
    approvedMonthCount: approvedMonth.length,
    approvedMonthValue: approvedMonth.reduce((s, x) => s + x.total, 0),
    approvedSeries: monthlySeries(rows.filter((x) => x.q.status === "approved"), (x) => x.q.signed_at, (x) => x.total, now),
    won90,
    lost90,
    winRate: winRate(won90, lost90),
    avgRecent: avg(recent),
    avgPrior: avg(prior),
    recentCount: recent.length,
    chips: { cold: chip("cold"), expiring: chip("expiring"), drafts: chip("drafts"), viewed: chip("viewed") },
  };
}

/**
 * The Quotes page's rich banner. `chip` / `setChip` are the page's active
 * chip; `setFilter` its status filter (tiles switch it; chips reset it to
 * "all" so their matches are all visible).
 */
export function useQuotesBanner({
  quotes,
  settings,
  loading,
  chip,
  setChip,
  setFilter,
  filter,
}: {
  quotes: QuoteRow[];
  settings: Pick<NotificationSettings, "cold_unopened_days" | "cold_unsigned_days"> | undefined;
  loading: boolean;
  chip: QuoteChip | null;
  setChip: (c: QuoteChip | null) => void;
  setFilter: (f: "all" | "sent" | "approved" | "draft") => void;
  filter: string;
}): { rich: RichBanner; matches: (q: QuoteRow) => boolean } {
  const { data: defaults = QUOTE_DEFAULTS_FALLBACK } = useQuery({ queryKey: ["quote-defaults"], queryFn: getQuoteDefaults });
  const s = settings ?? { cold_unopened_days: 3, cold_unsigned_days: 5 };
  const now = new Date();
  const st = quoteBannerStats(quotes, s, defaults.quote_validity_days, now);

  let insight: string;
  if (st.total === 0) insight = "No quotes yet — create your first one";
  else if (st.sentCount > 0)
    insight = [`${count(st.sentCount, "quote")} waiting on clients`, `${compactMoney(st.sentValue)} out for signature`, st.chips.cold > 0 ? `${st.chips.cold} going cold` : null].filter(Boolean).join(" · ");
  else if (st.chips.drafts > 0) insight = `Nothing out with clients · ${count(st.chips.drafts, "draft")} ready to send`;
  else insight = "Nothing waiting on clients right now";

  const go = (f: "all" | "sent" | "approved" | "draft") => {
    setChip(null);
    setFilter(f);
  };
  const rich: RichBanner = {
    insight,
    loading,
    listId: "quotes-list",
    activeChip: chip,
    onChip: (k) => {
      setChip(k as QuoteChip | null);
      if (k) setFilter("all");
    },
    chips: [
      { key: "cold", label: "going cold", count: st.chips.cold },
      { key: "expiring", label: "expiring this week", count: st.chips.expiring },
      { key: "drafts", label: st.chips.drafts === 1 ? "draft not sent" : "drafts not sent", count: st.chips.drafts },
      { key: "viewed", label: "viewed, not signed", count: st.chips.viewed },
    ],
    tiles: [
      {
        key: "out",
        label: "Out for signature",
        icon: Send,
        value: st.sentCount ? formatCurrency(st.sentValue) : "—",
        sub: st.sentCount ? count(st.sentCount, "quote") : st.total ? "Nothing out right now" : "Send your first quote to see this",
        onClick: () => go("sent"),
        active: !chip && filter === "sent",
      },
      {
        key: "approved",
        label: "Approved this month",
        icon: CircleCheck,
        value: st.approvedMonthCount ? formatCurrency(st.approvedMonthValue) : "—",
        sub: st.approvedMonthCount ? count(st.approvedMonthCount, "quote") : st.total ? "None signed yet this month" : "Signed quotes show here",
        subTone: st.approvedMonthCount ? "positive" : "muted",
        visual: st.approvedSeries.some((v) => v > 0) ? { kind: "spark", points: st.approvedSeries } : undefined,
        onClick: () => go("approved"),
        active: !chip && filter === "approved",
      },
      {
        key: "win",
        label: "Win rate, 90 days",
        icon: Trophy,
        value: st.winRate == null ? "—" : pct(st.winRate),
        sub: st.winRate == null ? "Shows once quotes are signed or declined" : `${st.won90} won · ${st.lost90} declined`,
        visual: st.winRate == null ? undefined : { kind: "progress", value: st.winRate },
        onClick: () => go("approved"),
      },
      {
        key: "avg",
        label: "Avg. quote, 90 days",
        icon: Calculator,
        value: st.avgRecent == null ? "—" : formatCurrency(Math.round(st.avgRecent)),
        sub: st.avgRecent == null ? "Quotes sent in the last 90 days" : (changeLabel(st.avgRecent, st.avgPrior ?? 0, "prior 90 days") ?? count(st.recentCount, "quote sent", "quotes sent")),
        onClick: () => go("all"),
      },
    ],
  };
  return { rich, matches: (q) => !chip || quoteChipMatch(q, chip, s, defaults.quote_validity_days, now) };
}

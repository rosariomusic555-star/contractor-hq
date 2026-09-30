import type { PortalProjectDetail, PortalQuote, PortalQuoteSection, PortalScheduleUpdate } from "./portalApi";
import { portalChangeOrderLabel, portalQuoteLabel } from "./portalApi";
import { portalProgressLabel, portalProjectPhase } from "./portalStatus";
import { clientGroupLike, clientQuoteTotal, groupPrice, missingRequired, sectionIncluded } from "./selections";
import { milestoneTrackers } from "./progress";
import { delayDayLabel } from "./scheduleShift";
import { effectiveInvoiceStatus } from "./financials";
import { invoiceBalance } from "./projectMoney";

/**
 * Client Hub desktop layout — the pure derivations behind the header's
 * "What's next" line, the "Needs your attention" cards and the quote
 * panel's breakdown. Built only from the client-facing payload
 * (get_portal_project / get_client_view_project) — nothing here can reach
 * internal data because none is in its input.
 */

export type HubTone = "green" | "amber" | "red" | "blue" | "gray";

export const HUB_TONE_CLASS: Record<HubTone, string> = {
  green: "bg-success/10 text-success",
  amber: "bg-warning/20 text-warning-strong",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-info/10 text-info",
  gray: "bg-muted text-muted-foreground",
};

const money0 = (n: number) => Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const todayISO = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const WHY: Record<PortalScheduleUpdate["reason"], string> = { rain: " due to rain", weather: " due to weather", schedule: "" };

/** "Schedule update: moved to Fri Oct 2 due to rain" (start moved) or
 * "…finish moved to Wed Oct 7 due to rain" (job extended). */
export function scheduleUpdateHeadline(u: PortalScheduleUpdate): string {
  const why = WHY[u.reason] ?? "";
  if (u.from_start !== u.to_start) return `Schedule update: moved to ${delayDayLabel(u.to_start)}${why}`;
  return `Schedule update: finish moved to ${delayDayLabel(u.to_end ?? u.to_start)}${why}`;
}

/** Required choices still open on a sent quote, counting only sections that
 * are in (an optional section the client hasn't added doesn't need picks). */
export function quoteMissingSelections(q: Pick<PortalQuote, "sections">, picks: Record<string, string[]> = {}) {
  const groups = q.sections.filter((s) => sectionIncluded(s)).flatMap((s) => (s.selections ?? []).map(clientGroupLike));
  return missingRequired(groups, picks);
}

// ---------------------------------------------------------------------------
// Needs your attention
// ---------------------------------------------------------------------------

export interface AttentionItem {
  key: string;
  kind: "quote" | "change_order" | "invoice";
  /** Document path under the Hub's docBase: "quote/<id>". */
  path: string;
  eyebrow: string;
  title: string;
  detail: string;
  cta: string;
  tone: HubTone;
}

/** Everything waiting on the client, in the order they should act: quotes
 * and add-ons to sign (or make selections on), change orders to approve,
 * then unpaid invoices — overdue first, then by due date. */
export function attentionItems(detail: PortalProjectDetail, now: Date = new Date()): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const q of detail.quotes.filter((x) => x.status === "sent")) {
    const missing = quoteMissingSelections(q);
    out.push({
      key: `q-${q.id}`,
      kind: "quote",
      path: `quote/${q.id}`,
      eyebrow: missing.length ? "Selections to make" : "Quote to sign",
      title: q.kind === "addon" ? `${portalQuoteLabel(q)} — new work` : "Your quote",
      detail: missing.length
        ? `${missing.length} choice${missing.length === 1 ? "" : "s"} to make · ${money0(clientQuoteTotal(q.sections))}`
        : money0(clientQuoteTotal(q.sections)),
      cta: missing.length ? "Make selections" : "Review & sign",
      tone: "amber",
    });
  }
  for (const co of detail.change_orders.filter((c) => c.status === "sent")) {
    out.push({
      key: `co-${co.id}`,
      kind: "change_order",
      path: `change-order/${co.id}`,
      eyebrow: "Change order to approve",
      title: `${portalChangeOrderLabel(co)}: ${co.title}`,
      detail: `${co.amount < 0 ? "−" : "+"}${money0(co.amount)} to your contract`,
      cta: "Review & approve",
      tone: "amber",
    });
  }
  const invoices = detail.invoices
    .map((inv) => {
      const like = { ...inv, status: inv.status as "sent" };
      return { inv, balance: invoiceBalance(like), late: effectiveInvoiceStatus(like, now) === "overdue" };
    })
    .filter((x) => x.inv.status !== "paid" && x.balance > 0.004)
    .sort((a, b) => Number(b.late) - Number(a.late) || (a.inv.due_date ?? "9999").localeCompare(b.inv.due_date ?? "9999"));
  for (const { inv, balance, late } of invoices) {
    out.push({
      key: `inv-${inv.id}`,
      kind: "invoice",
      path: `invoice/${inv.id}`,
      eyebrow: late ? "Invoice past due" : "Invoice due",
      title: `Invoice ${inv.invoice_number ?? ""}`.trim(),
      detail: `${money0(balance)} ${late ? "overdue" : "due"}${inv.due_date ? ` · ${late ? "was due" : "by"} ${shortDate(inv.due_date)}` : ""}`,
      cta: "View & pay",
      tone: late ? "red" : "amber",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// What's next
// ---------------------------------------------------------------------------

export interface WhatsNext {
  text: string;
  tone: HubTone;
}

const RECENT_SCHEDULE_DAYS = 7;

/**
 * One plain-language line for the header, first match wins:
 *   1. something to sign / approve        → "Waiting on your approval"
 *   2. an invoice past due                 → "Invoice INV-104 is past due"
 *   3. complete                            → "Project complete"
 *   4. a schedule change in the last week  → "Moved to Fri Oct 2 due to rain"
 *   5. in progress, with a milestone next  → "Up next on Patio: Pavers · Day 6…"
 *   6. in progress                         → "Day 6 — work is underway"
 *   7. scheduled                           → "Work starts Fri, Oct 2"
 *   8. estimating                          → "Reviewing your quote"
 */
export function whatsNext(detail: PortalProjectDetail, now: Date = new Date()): WhatsNext {
  const items = attentionItems(detail, now);
  const toSign = items.filter((i) => i.kind !== "invoice");
  if (toSign.length === 1) return { text: `Waiting on your approval: ${toSign[0].title}`, tone: "amber" };
  if (toSign.length > 1) return { text: `Waiting on your approval: ${toSign.length} items`, tone: "amber" };
  const late = items.find((i) => i.kind === "invoice" && i.tone === "red");
  if (late) return { text: `${late.title} is past due`, tone: "red" };

  const phase = portalProjectPhase(detail.project);
  if (phase === "complete") {
    const end = detail.project.actual_end_date;
    return { text: end ? `Project complete · finished ${shortDate(end)}` : "Project complete", tone: "green" };
  }

  const latestSchedule = (detail.schedule_updates ?? [])[0];
  if (latestSchedule && now.getTime() - new Date(latestSchedule.posted_at).getTime() < RECENT_SCHEDULE_DAYS * 86_400_000) {
    return { text: scheduleUpdateHeadline(latestSchedule).replace("Schedule update: m", "M").replace("Schedule update: f", "F"), tone: "blue" };
  }

  if (phase === "in_progress") {
    const progress = portalProgressLabel(detail.project, now);
    const p = detail.progress;
    if (p) {
      const updates = p.updates.map((u) => ({ feature_id: u.feature, milestone: u.milestone, date: u.date }));
      const trackers = milestoneTrackers(p.features, updates, p.milestone_presets);
      // The feature worked on most recently.
      const lastDate = (featureId: string) =>
        updates.filter((u) => u.feature_id === featureId && u.milestone).reduce((m, u) => (u.date > m ? u.date : m), "");
      const active = trackers.filter((t) => t.next).sort((a, b) => lastDate(b.featureId).localeCompare(lastDate(a.featureId)))[0];
      if (active) return { text: `Up next on ${active.label}: ${active.next}${progress ? ` · ${progress}` : ""}`, tone: "green" };
    }
    return { text: progress ?? "Work is underway", tone: "green" };
  }

  if (phase === "scheduled") {
    const start = detail.project.scheduled_start_date;
    if (start && start.slice(0, 10) >= todayISO(now)) return { text: `Work starts ${shortDate(start)}`, tone: "gray" };
    return { text: start ? "Scheduled — work starting soon" : "Scheduled — dates coming soon", tone: "gray" };
  }

  const approved = detail.quotes.some((q) => q.status === "approved");
  return approved ? { text: "Quote approved — scheduling is next", tone: "gray" } : { text: "Reviewing your quote", tone: "gray" };
}

/** The header status pill: green done / in progress, amber waiting on the
 * client, gray upcoming. */
export function phaseTone(detail: PortalProjectDetail): HubTone {
  const phase = portalProjectPhase(detail.project);
  if (phase === "complete" || phase === "in_progress") return "green";
  if (detail.quotes.some((q) => q.status === "sent") || detail.change_orders.some((c) => c.status === "sent")) return "amber";
  return "gray";
}

/** The header photo: the finished "after" shot once the job is done, else
 * the newest shared progress photo, else the first shared project photo
 * (the contractor's own order). Null → a quiet placeholder. */
export function coverPhotoPath(detail: PortalProjectDetail): string | null {
  const p = detail.progress;
  if (portalProjectPhase(detail.project) === "complete" && p?.before_after.length) return p.before_after[p.before_after.length - 1].after;
  const withPhotos = [...(p?.updates ?? [])].filter((u) => u.photos.length).sort((a, b) => b.date.localeCompare(a.date));
  if (withPhotos.length) return withPhotos[0].photos[0];
  return detail.photos[0]?.storage_path ?? null;
}

// ---------------------------------------------------------------------------
// Quote panel breakdown
// ---------------------------------------------------------------------------

/** Base (required lines) + optional lines the client added + selection
 * adjustments = total — the same rule as clientQuoteTotal, split out. */
export function quoteBreakdown(sections: PortalQuoteSection[], picks: Record<string, string[]> = {}) {
  let base = 0;
  let optional = 0;
  let selections = 0;
  for (const s of sections) {
    for (const i of s.items) {
      const line = Number(i.price) * Number(i.quantity ?? 1);
      if (!(s.is_optional || i.is_optional)) base += line;
      else if (i.client_selected) optional += line;
    }
    if (s.selections?.length && sectionIncluded(s)) {
      for (const g of s.selections) {
        const like = clientGroupLike(g);
        selections += groupPrice(like, picks[g.id] ?? like.picked);
      }
    }
  }
  return { base, optional, selections, total: base + optional + selections };
}

/** "What we're building": the approved original quote's sections, then each
 * approved add-on's (tagged) — add-ons are part of the job once approved. */
export function projectScopeSections(detail: Pick<PortalProjectDetail, "quotes">) {
  const approvedQuote = detail.quotes.find((q) => q.status === "approved" && q.kind !== "addon") ?? null;
  const approvedAddons = detail.quotes.filter((q) => q.status === "approved" && q.kind === "addon");
  return [
    ...(approvedQuote?.sections ?? []).map((s) => ({ s, tag: null as string | null })),
    ...approvedAddons.flatMap((q) => q.sections.map((s) => ({ s, tag: `Add-on${q.addon_number ? ` #${q.addon_number}` : ""}` }))),
  ];
}

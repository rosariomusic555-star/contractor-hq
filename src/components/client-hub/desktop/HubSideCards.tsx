import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, CloudRain, Mail, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { clientProjectMoney } from "@/lib/projectHistory";
import { portalProgressLabel } from "@/lib/portalStatus";
import { delayDayLabel } from "@/lib/scheduleShift";
import { HUB_TONE_CLASS, scheduleUpdateHeadline, type AttentionItem } from "@/lib/hubDesktop";
import { HubCard, MoneyLine } from "./HubPrimitives";
import { HOW_TO_PAY, focusRing, hubDate, hubMoney } from "./hubUtils";

/** "Needs your attention" — one card per thing waiting on the client, each
 * with one primary button; "You're all caught up" when there's nothing. */
export function AttentionCard({ items, docBase }: { items: AttentionItem[]; docBase: string }) {
  return (
    <HubCard title="Needs your attention">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-3 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" /> You're all caught up
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.key} className="rounded-xl border border-border p-3.5">
              <p className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", HUB_TONE_CLASS[it.tone])}>
                {it.eyebrow}
              </p>
              <p className="mt-1.5 text-sm font-bold text-foreground [overflow-wrap:anywhere]">{it.title}</p>
              <p className="text-sm tabular-nums text-muted-foreground">{it.detail}</p>
              <Button asChild className="mt-3 h-10 w-full font-bold">
                <Link to={`${docBase}/${it.path}`}>{it.cta}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </HubCard>
  );
}

/** Contract value, paid, remaining — and the way to pay the next invoice. */
export function BalanceCard({ detail, docBase, items }: { detail: PortalProjectDetail; docBase: string; items: AttentionItem[] }) {
  const { breakdown, summary } = clientProjectMoney(detail);
  const invoices = items.filter((i) => i.kind === "invoice");
  const overpaid = summary.overpaid > 0.004;
  if (breakdown.lines.length === 0 && summary.received === 0 && invoices.length === 0) {
    return (
      <HubCard title="Balance">
        <p className="text-sm text-muted-foreground">Your balance shows up here once you approve a quote.</p>
      </HubCard>
    );
  }
  return (
    <HubCard title="Balance">
      <div className="rounded-xl bg-primary/10 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{overpaid ? "Credit balance" : "Remaining"}</p>
        <p className="mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
          {hubMoney(overpaid ? summary.overpaid : Math.max(0, summary.remaining))}
        </p>
      </div>
      <div className="mt-2">
        <MoneyLine label="Current contract" value={hubMoney(breakdown.total)} />
        <MoneyLine label="Paid so far" value={hubMoney(summary.received)} />
        {summary.unpaidInvoiceBalance > 0.004 && <MoneyLine label="Invoiced, not yet paid" value={hubMoney(summary.unpaidInvoiceBalance)} />}
      </div>
      {invoices.length > 0 && (
        <>
          <Button asChild size="lg" className="mt-3 h-12 w-full text-base font-bold">
            <Link to={`${docBase}/${invoices[0].path}#pay`}>
              {invoices.length === 1 ? `Pay ${invoices[0].title}` : `Pay invoices (${invoices.length} open)`}
            </Link>
          </Button>
          <p className="mt-2 text-xs text-muted-subtle">{HOW_TO_PAY}</p>
        </>
      )}
    </HubCard>
  );
}

const RECENT_DAYS = 14;
const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Planned dates, where the job is, the latest schedule change (if recent)
 * and materials on the way. */
export function ScheduleCard({ detail, now = new Date() }: { detail: PortalProjectDetail; now?: Date }) {
  const p = detail.project;
  const progress = portalProgressLabel(p, now);
  const latest = (detail.schedule_updates ?? [])[0];
  const recent = latest && now.getTime() - new Date(latest.posted_at).getTime() < RECENT_DAYS * 86_400_000 ? latest : null;
  const incoming = detail.deliveries.filter((d) => d.status !== "delivered");
  const hasDates = p.scheduled_start_date || p.scheduled_end_date;
  if (!hasDates && !progress && !recent && incoming.length === 0) return null;
  return (
    <HubCard title="Schedule">
      {hasDates && (
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-subtle" />
          {delayDayLabel(p.scheduled_start_date)} – {delayDayLabel(p.scheduled_end_date)}
        </p>
      )}
      {progress && <p className="mt-1 text-sm text-muted-foreground">{progress}</p>}
      {recent && (
        <div className="mt-3 rounded-xl border-l-4 border-l-info bg-info/5 px-3 py-2.5 text-sm">
          <p className="flex items-start gap-1.5 font-semibold text-foreground">
            {recent.reason === "schedule" ? (
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            ) : (
              <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            )}
            {sentenceCase(scheduleUpdateHeadline(recent).replace("Schedule update: ", ""))}
          </p>
          <p className="mt-0.5 text-xs text-muted-subtle">
            Posted {new Date(recent.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      )}
      {incoming.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
          {incoming.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-subtle" />
              <span>
                <span className="font-semibold text-foreground">{d.supplier ?? "Materials"}</span>
                {d.status === "delayed" ? " · delayed" : d.expected_delivery_date ? ` · expected ${hubDate(d.expected_delivery_date)}` : " · on the way"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </HubCard>
  );
}

/** Who to call. `onMessage` scrolls to the message thread (Hub only). */
export function ContactDetails({ detail, onMessage }: { detail: PortalProjectDetail; onMessage?: () => void }) {
  const b = detail.business;
  const link = cn("flex items-center gap-2 rounded-md text-sm font-semibold text-foreground hover:text-primary", focusRing);
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-bold text-foreground">{b.company_name ?? "Your contractor"}</p>
      {b.phone && (
        <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className={link}>
          <Phone className="h-4 w-4 text-muted-subtle" /> {b.phone}
        </a>
      )}
      {b.email && (
        <a href={`mailto:${b.email}`} className={cn(link, "[overflow-wrap:anywhere]")}>
          <Mail className="h-4 w-4 shrink-0 text-muted-subtle" /> {b.email}
        </a>
      )}
      {b.address && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-subtle" /> {b.address}
        </p>
      )}
      {b.license && <p className="text-xs text-muted-subtle">License {b.license}</p>}
      {onMessage && (
        <Button variant="outline" className="h-10 w-full font-semibold" onClick={onMessage}>
          <MessageCircle className="h-4 w-4" /> Message
        </Button>
      )}
    </div>
  );
}

export function ContactCard({ detail, onMessage }: { detail: PortalProjectDetail; onMessage?: () => void }) {
  return (
    <HubCard title="Your contractor" id="contact">
      <ContactDetails detail={detail} onMessage={onMessage} />
    </HubCard>
  );
}

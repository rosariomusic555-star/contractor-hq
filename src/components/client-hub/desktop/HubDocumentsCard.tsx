import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, FilePen, FileText, GitBranch, Receipt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { portalChangeOrderLabel, portalQuoteLabel, type PortalProjectDetail } from "@/lib/portalApi";
import { versionsOf } from "@/lib/projectHistory";
import { effectiveInvoiceStatus } from "@/lib/financials";
import { invoiceBalance } from "@/lib/projectMoney";
import type { HubTone } from "@/lib/hubDesktop";
import { DownloadSummaryButton } from "@/components/client-hub/DownloadSummaryButton";
import { HubCard, TonePill } from "./HubPrimitives";
import { focusRing, hubDate, hubMoney, type SignUrls } from "./hubUtils";

interface DocRow {
  key: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  status: { label: string; tone: HubTone };
  to?: string;
  href?: string;
}

const decision = (s: "sent" | "approved" | "declined", sentLabel: string): { label: string; tone: HubTone } =>
  s === "approved" ? { label: "Signed", tone: "green" } : s === "declined" ? { label: "Declined", tone: "gray" } : { label: sentLabel, tone: "amber" };

/** Every document the client has: quotes (with version count), change
 * orders, invoices, receipts, and the project summary PDF. */
export function HubDocumentsCard({ detail, docBase, signUrls }: { detail: PortalProjectDetail; docBase: string; signUrls: SignUrls }) {
  const rows: DocRow[] = [];
  for (const q of detail.quotes) {
    const n = versionsOf(detail, "quote", q.id).length;
    rows.push({
      key: `q-${q.id}`,
      icon: q.kind === "addon" ? FilePen : FileText,
      title: portalQuoteLabel(q),
      meta: [n > 1 ? `v${n}` : null, hubDate(q.signed_at ?? q.created_at)].filter(Boolean).join(" · "),
      status: decision(q.status, "Awaiting your signature"),
      to: `${docBase}/quote/${q.id}`,
    });
  }
  for (const co of detail.change_orders) {
    rows.push({
      key: `co-${co.id}`,
      icon: GitBranch,
      title: `${portalChangeOrderLabel(co)}: ${co.title}`,
      meta: `${co.amount < 0 ? "−" : "+"}${hubMoney(Math.abs(co.amount))} · ${hubDate(co.approved_at ?? co.created_at)}`,
      status: decision(co.status, "Awaiting your approval"),
      to: `${docBase}/change-order/${co.id}`,
    });
  }
  for (const inv of detail.invoices) {
    const like = { ...inv, status: inv.status as "sent" };
    const late = effectiveInvoiceStatus(like) === "overdue";
    const partial = inv.status !== "paid" && Number(inv.amount_paid ?? 0) > 0.004;
    rows.push({
      key: `inv-${inv.id}`,
      icon: Receipt,
      title: `Invoice ${inv.invoice_number ?? ""}`.trim(),
      meta: `${hubMoney(Number(inv.amount))}${inv.status !== "paid" && inv.due_date ? ` · due ${hubDate(inv.due_date)}` : ""}`,
      status:
        inv.status === "paid" || invoiceBalance(like) <= 0.004
          ? { label: "Paid", tone: "green" }
          : late
            ? { label: "Overdue", tone: "red" }
            : { label: partial ? "Partially paid" : "Due", tone: "amber" },
      to: `${docBase}/invoice/${inv.id}`,
    });
  }
  for (const p of (detail.payments ?? []).filter((x) => x.status === "active" && x.token)) {
    rows.push({
      key: `r-${p.token}`,
      icon: Receipt,
      title: `Receipt ${p.receipt_number ?? ""}`.trim(),
      meta: `${hubMoney(Number(p.amount))} · ${hubDate(p.paid_on)}`,
      status: { label: "Payment received", tone: "green" },
      href: `/receipt/${p.token}`,
    });
  }

  return (
    <HubCard title="Documents">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Quotes, change orders, invoices and receipts will appear here.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => {
            const Icon = r.icon;
            const inner = (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{r.title}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">{r.meta}</span>
                </span>
                <TonePill tone={r.status.tone} className="shrink-0">
                  {r.status.label}
                </TonePill>
                {r.href ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-subtle" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                )}
              </>
            );
            const cls = cn("-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50", focusRing);
            return (
              <li key={r.key}>
                {r.to ? (
                  <Link to={r.to} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <a href={r.href} target="_blank" rel="noreferrer" className={cls}>
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DownloadSummaryButton
        detail={detail}
        getLogoUrl={async (path) => (await signUrls([path]))[path] ?? null}
        className="mt-4 w-full"
        label="Download project summary (PDF)"
      />
    </HubCard>
  );
}

import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPortalProjectDetail,
  portalChangeOrderLabel,
  portalQuoteLabel,
  type PortalDocType,
  type PortalQuote,
  type PortalChangeOrder,
  type PortalInvoice,
  type PortalSelectionGroup,
} from "@/lib/portalApi";
import { clientQuoteTotal, priceLabel } from "@/lib/selections";
import { RequestSelectionChangeDialog } from "@/components/selections/RequestSelectionChangeDialog";
import { useQuoteTracking } from "@/hooks/use-quote-tracking";
import { getClientViewProject } from "@/lib/api";
import { versionDate, versionsOf } from "@/lib/projectHistory";
import { cn } from "@/lib/utils";
import { BackLink } from "@/components/common/BackLink";
import { depositAmount } from "@/lib/projectMoney";

const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

/**
 * A single document — quote, change order, or invoice — as a clean,
 * printable page (the browser's print-to-PDF; everything `no-print` drops
 * out). ?v=N shows an earlier version exactly as it was sent / approved
 * (0113), labeled "Superseded by vN"; the version strip links them all.
 *
 * mode "preview" is the contractor's Client view: same page, same
 * client-safe data, loaded through the contractor's session.
 */
/** "45 sq ft × $28.75" under a line — only when it's more than one of something. */
function qtyLine(quantity: number | null | undefined, unit: string | null | undefined, price: number) {
  const q = Number(quantity ?? 1);
  if (!Number.isFinite(q) || q === 1) return null;
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {q} {unit || "×"} {unit ? "× " : ""}
      {money(price)}
    </p>
  );
}

export function PortalDocumentView({ mode = "portal" }: { mode?: "portal" | "preview" }) {
  const { projectId = "", kind = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const vParam = Number(params.get("v")) || null;
  const projectBase = mode === "preview" ? `/projects/${projectId}/client-view` : `/portal/projects/${projectId}`;

  const { data: detail, isLoading } = useQuery({
    queryKey: [mode === "preview" ? "client-view" : "portal-project", projectId],
    queryFn: () => (mode === "preview" ? getClientViewProject(projectId) : getPortalProjectDetail(projectId)),
  });
  // Quote activity (0117): only the client in the Hub, on the current
  // version — never the contractor's Client view preview.
  const { trackEvent } = useQuoteTracking({
    channel: "hub",
    quoteId: id,
    enabled: mode === "portal" && kind === "quote" && !vParam && !!detail,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
      </div>
    );
  }

  if (!detail) {
    return <div className="py-16 text-center text-sm text-muted-foreground">That document isn't available.</div>;
  }

  const docType: PortalDocType | null = kind === "quote" ? "quote" : kind === "change-order" ? "change_order" : kind === "invoice" ? "invoice" : null;
  const live =
    kind === "quote"
      ? detail.quotes.find((q) => q.id === id)
      : kind === "change-order"
        ? detail.change_orders.find((c) => c.id === id)
        : kind === "invoice"
          ? detail.invoices.find((i) => i.id === id)
          : undefined;
  const versions = docType ? versionsOf(detail, docType, id) : [];
  const latest = versions[versions.length - 1]?.version ?? null;
  const shown = vParam && vParam !== latest ? versions.find((v) => v.version === vParam) : undefined;
  const doc = (shown?.content ?? live) as PortalQuote | PortalChangeOrder | PortalInvoice | undefined;

  if (!doc || !live) {
    return <div className="py-16 text-center text-sm text-muted-foreground">That document isn't available.</div>;
  }
  // An old version shows the state it was left in; the current one, live.
  const statusOverride = shown ? (shown.state === "issued" ? undefined : shown.state === "sent" ? "superseded" : shown.state) : undefined;
  const docPath = `${projectBase}/documents/${kind}/${id}`;

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <BackLink
          to={projectBase}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Back to project</BackLink>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (kind === "quote") trackEvent("pdf_downloaded", {});
            window.print();
          }}
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Save as PDF
        </Button>
      </div>

      {versions.length > 1 && (
        <div className="no-print flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-muted-foreground">Versions:</span>
          {versions.map((v) => {
            const active = (shown?.version ?? latest) === v.version;
            return (
              <Link
                key={v.version}
                to={v.version === latest ? docPath : `${docPath}?v=${v.version}`}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-semibold",
                  active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                v{v.version}
                {v.version === latest ? " · current" : ""}
              </Link>
            );
          })}
        </div>
      )}

      <div className="card-surface space-y-5 p-6">
        {shown && latest && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <span className="font-bold text-foreground">Version {shown.version} — superseded by v{latest}.</span>{" "}
            <span className="text-muted-foreground">
              This is exactly what was sent on {dateStr(versionDate(shown, (live as { created_at?: string }).created_at))}.{" "}
              <Link to={docPath} className="font-semibold text-primary hover:underline">
                See the current version
              </Link>
            </span>
          </div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-subtle">
            {detail.business.company_name ?? "Your contractor"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground">{detail.project.name}</h1>
        </div>

        {kind === "quote" && (
          <QuoteDocument
            quote={doc as PortalQuote}
            statusOverride={statusOverride}
            version={shown?.version ?? (versions.length > 1 ? latest : null)}
            canRequestChange={mode === "portal" && !shown && (live as PortalQuote).status === "approved"}
          />
        )}
        {kind === "change-order" && <ChangeOrderDocument changeOrder={statusOverride && statusOverride !== "superseded" ? { ...(doc as PortalChangeOrder), status: statusOverride as PortalChangeOrder["status"] } : (doc as PortalChangeOrder)} />}
        {kind === "invoice" && <InvoiceDocument invoice={shown ? { ...(doc as PortalInvoice), status: (live as PortalInvoice).status, amount_paid: (live as PortalInvoice).amount_paid } : (doc as PortalInvoice)} />}
      </div>
    </div>
  );
}

function QuoteDocument({
  quote,
  statusOverride,
  version,
  canRequestChange = false,
}: {
  quote: PortalQuote;
  statusOverride?: string;
  version?: number | null;
  /** Client Hub, current approved version: "Request a change" per selection. */
  canRequestChange?: boolean;
}) {
  const status = statusOverride ?? quote.status;
  const total = clientQuoteTotal(quote.sections);
  const [requesting, setRequesting] = useState<PortalSelectionGroup | null>(null);
  const deposit = depositAmount(total, quote.deposit_percentage);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">
          {portalQuoteLabel(quote)}
          {version ? ` · v${version}` : ""}
        </h2>
        <span className="text-sm font-bold text-foreground">
          {status === "approved" ? "Approved" : status === "declined" ? "Declined" : status === "superseded" ? "Superseded" : "Pending"}
        </span>
      </div>

      {quote.sections.map((section) => (
        <div key={section.id}>
          <h3 className="text-sm font-bold text-foreground">{section.name}</h3>
          <div className="mt-2 divide-y divide-hairline">
            {section.items.map((item) => {
              // An optional line the client didn't choose isn't in the total —
              // say so, or the lines add up to more than the quote.
              const notChosen = (section.is_optional || item.is_optional) && !item.client_selected;
              return (
                <div key={item.id} className={cn("flex items-start justify-between gap-3 py-2", notChosen && "opacity-60")}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    {qtyLine(item.quantity, item.unit, item.price)}
                  </div>
                  <p className="shrink-0 text-right text-sm font-bold tabular-nums text-foreground">
                    <span className={cn(notChosen && "font-semibold line-through")}>{money(item.price * item.quantity)}</span>
                    {notChosen && <span className="block text-xs font-semibold text-muted-foreground">Optional · not included</span>}
                  </p>
                </div>
              );
            })}
          </div>
          {(section.selections ?? []).length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2.5 text-sm">
              {section.selections!.map((g) => {
                const eff = g.picked.length ? g.picked : g.options.filter((o) => o.is_default).map((o) => o.id);
                const chosen = g.options.filter((o) => eff.includes(o.id));
                const final = status === "approved";
                return (
                  <div key={g.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-muted-foreground">{g.name}</span>
                    <span className="text-right font-semibold text-foreground">
                      {final || g.picked.length
                        ? chosen.map((o) => `${o.name}${o.price_delta ? ` (${priceLabel(o.price_delta)})` : ""}`).join(", ") || "—"
                        : "Client to choose"}
                      {canRequestChange && final && (
                        <button type="button" onClick={() => setRequesting(g)} className="no-print ml-2 text-xs font-semibold text-primary hover:underline">
                          Request a change
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className="space-y-1.5 border-t border-hairline pt-3">
        <div className="flex items-center justify-between text-base font-extrabold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{money(total)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Deposit ({quote.deposit_percentage}%)</span>
          <span className="tabular-nums">{money(deposit)}</span>
        </div>
      </div>

      {quote.notes && (
        <div>
          <h3 className="text-sm font-bold text-foreground">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
        </div>
      )}
      {quote.terms && (
        <div>
          <h3 className="text-sm font-bold text-foreground">Terms</h3>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{quote.terms}</p>
        </div>
      )}

      {status === "approved" && quote.signed_at && (
        <p className="text-xs text-muted-subtle">
          Signed by {quote.signed_by ?? "client"} on {dateStr(quote.signed_at)}
        </p>
      )}
      {status === "declined" && quote.declined_at && <p className="text-xs text-muted-subtle">Declined on {dateStr(quote.declined_at)}</p>}
      <RequestSelectionChangeDialog group={requesting} onClose={() => setRequesting(null)} />
    </div>
  );
}

function ChangeOrderDocument({ changeOrder }: { changeOrder: PortalChangeOrder }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">{portalChangeOrderLabel(changeOrder)}</h2>
        <span className="text-sm font-bold text-foreground">
          {changeOrder.status === "approved" ? "Approved" : changeOrder.status === "declined" ? "Declined" : "Sent"}
        </span>
      </div>
      <div>
        <p className="text-base font-bold text-foreground">{changeOrder.title}</p>
        {changeOrder.description && <p className="mt-1 text-sm text-muted-foreground">{changeOrder.description}</p>}
      </div>
      {changeOrder.sections.length > 0 && (
        <div className="space-y-3">
          {changeOrder.sections.map((section) => (
            <div key={section.id}>
              {section.name && <p className="text-sm font-bold text-foreground">{section.name}</p>}
              {section.scope_note && <p className="text-xs text-muted-foreground">Change: {section.scope_note}</p>}
              <div className="mt-1.5 space-y-2">
                {section.items.map((item) => {
                  const lineTotal = item.price * (item.quantity ?? 1);
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                        {qtyLine(item.quantity ?? 1, item.unit ?? null, item.price)}
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                        {lineTotal >= 0 ? "+" : "−"}
                        {money(Math.abs(lineTotal))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-base font-extrabold text-foreground">
        <span>Change to contract</span>
        <span className="tabular-nums">
          {changeOrder.amount >= 0 ? "+" : "−"}
          {money(Math.abs(changeOrder.amount))}
        </span>
      </div>
      {!!changeOrder.schedule_impact_days && (
        <p className="text-sm text-muted-foreground">
          Schedule impact:{" "}
          <span className="font-semibold text-foreground">
            {changeOrder.schedule_impact_days > 0
              ? `Adds ${changeOrder.schedule_impact_days} working day${changeOrder.schedule_impact_days === 1 ? "" : "s"}`
              : `Saves ${Math.abs(changeOrder.schedule_impact_days)} working day${Math.abs(changeOrder.schedule_impact_days) === 1 ? "" : "s"}`}
          </span>
        </p>
      )}
      {changeOrder.approved_at && (
        <p className="text-xs text-muted-subtle">
          Approved by {changeOrder.approved_by ?? "client"} on {dateStr(changeOrder.approved_at)}
        </p>
      )}
      {changeOrder.declined_at && (
        <p className="text-xs text-muted-subtle">Declined on {dateStr(changeOrder.declined_at)}</p>
      )}
    </div>
  );
}

function InvoiceDocument({ invoice }: { invoice: PortalInvoice }) {
  const paidSoFar = Number(invoice.amount_paid ?? 0);
  const partial = invoice.status !== "paid" && paidSoFar > 0.004;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">Invoice {invoice.invoice_number ?? ""}</h2>
        <span className="text-sm font-bold text-foreground">
          {invoice.status === "paid" ? "Paid" : partial ? "Partially paid" : invoice.status === "overdue" ? "Overdue" : "Due"}
        </span>
      </div>
      {(invoice.items ?? []).length > 0 && (
        <div className="divide-y divide-hairline">
          {(invoice.items ?? []).map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-semibold text-foreground">{it.description || "Item"}</span>
                {Number(it.quantity) !== 1 && (
                  <span className="block text-xs text-muted-foreground">
                    {Number(it.quantity)} × {money(Number(it.unit_price))}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-foreground">{money(Number(it.quantity) * Number(it.unit_price))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-base font-extrabold text-foreground">
        <span>Amount</span>
        <span className="tabular-nums">{money(invoice.amount)}</span>
      </div>
      {partial && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Paid</span>
            <span className="tabular-nums">{money(paidSoFar)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-bold text-foreground">
            <span>Balance due</span>
            <span className="tabular-nums">{money(Math.max(0, Number(invoice.amount) - paidSoFar))}</span>
          </div>
        </>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Due date</span>
        <span>{dateStr(invoice.due_date)}</span>
      </div>
      {invoice.paid_at && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Paid on</span>
          <span>{dateStr(invoice.paid_at)}</span>
        </div>
      )}
      {invoice.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>}
      {invoice.status !== "paid" && (
        <div id="pay" className="no-print rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">How to pay</p>
          <p className="mt-1">
            Pay by check, bank transfer, Zelle or another method your contractor accepts — contact them for details.
            You'll get a receipt for every payment.
          </p>
        </div>
      )}
    </div>
  );
}

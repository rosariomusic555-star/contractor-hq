import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPortalProjectDetail, type PortalQuote, type PortalChangeOrder, type PortalInvoice } from "@/lib/portalApi";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

/**
 * A single document — quote, change order, or invoice — as a clean,
 * printable page. "Downloadable as PDF" here is the browser's own
 * print-to-PDF (this codebase has no PDF library or rendering service at
 * all, see src/index.css's .no-print doc comment) — the Print button below
 * triggers window.print(), and everything with the `no-print` class (the
 * hub's own header, this button) drops out of that output.
 */
export function PortalDocumentView() {
  const { projectId = "", kind = "", id = "" } = useParams();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["portal-project", projectId],
    queryFn: () => getPortalProjectDetail(projectId),
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

  const quote = kind === "quote" ? detail.quotes.find((q) => q.id === id) : null;
  const changeOrder = kind === "change-order" ? detail.change_orders.find((c) => c.id === id) : null;
  const invoice = kind === "invoice" ? detail.invoices.find((i) => i.id === id) : null;

  if (!quote && !changeOrder && !invoice) {
    return <div className="py-16 text-center text-sm text-muted-foreground">That document isn't available.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link
          to={`/portal/projects/${projectId}`}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to project
        </Link>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="card-surface space-y-5 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-subtle">
            {detail.business.company_name ?? "Your contractor"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground">{detail.project.name}</h1>
        </div>

        {quote && <QuoteDocument quote={quote} />}
        {changeOrder && <ChangeOrderDocument changeOrder={changeOrder} />}
        {invoice && <InvoiceDocument invoice={invoice} />}
      </div>
    </div>
  );
}

function QuoteDocument({ quote }: { quote: PortalQuote }) {
  const included = quote.sections.flatMap((s) =>
    s.items.filter((i) => !(s.is_optional || i.is_optional) || i.client_selected),
  );
  const total = included.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deposit = (total * quote.deposit_percentage) / 100;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">Quote</h2>
        <span className="text-sm font-bold text-foreground">
          {quote.status === "approved" ? "Approved" : quote.status === "declined" ? "Declined" : "Pending"}
        </span>
      </div>

      {quote.sections.map((section) => (
        <div key={section.id}>
          <h3 className="text-sm font-bold text-foreground">{section.name}</h3>
          <div className="mt-2 divide-y divide-hairline">
            {section.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  {money(item.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>
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

      {quote.signed_at && (
        <p className="text-xs text-muted-subtle">
          Signed by {quote.signed_by ?? "client"} on {dateStr(quote.signed_at)}
        </p>
      )}
      {quote.declined_at && <p className="text-xs text-muted-subtle">Declined on {dateStr(quote.declined_at)}</p>}
    </div>
  );
}

function ChangeOrderDocument({ changeOrder }: { changeOrder: PortalChangeOrder }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">Change order</h2>
        <span className="text-sm font-bold text-foreground">
          {changeOrder.status === "approved" ? "Approved" : changeOrder.status === "rejected" ? "Declined" : "Pending"}
        </span>
      </div>
      <div>
        <p className="text-base font-bold text-foreground">{changeOrder.title}</p>
        {changeOrder.description && <p className="mt-1 text-sm text-muted-foreground">{changeOrder.description}</p>}
      </div>
      <div className="flex items-center justify-between text-base font-extrabold text-foreground">
        <span>Change to contract</span>
        <span className="tabular-nums">
          {changeOrder.amount >= 0 ? "+" : "−"}
          {money(Math.abs(changeOrder.amount))}
        </span>
      </div>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h2 className="text-lg font-bold text-foreground">Invoice {invoice.invoice_number ?? ""}</h2>
        <span className="text-sm font-bold text-foreground">
          {invoice.status === "paid" ? "Paid" : invoice.status === "overdue" ? "Overdue" : "Due"}
        </span>
      </div>
      <div className="flex items-center justify-between text-base font-extrabold text-foreground">
        <span>Amount</span>
        <span className="tabular-nums">{money(invoice.amount)}</span>
      </div>
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
    </div>
  );
}

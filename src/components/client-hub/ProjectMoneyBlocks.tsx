import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { PortalProjectDetail } from "@/lib/portalApi";
import { clientProjectMoney, historyDate } from "@/lib/projectHistory";
import { invoiceBalance } from "@/lib/projectMoney";

const usd = (v: number) => Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" });

function Line({ label, value, strong, sign, muted }: { label: string; value: number; strong?: boolean; sign?: "+" | "−" | "="; muted?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-2", strong && "border-t border-border pt-2.5")}>
      <span className={cn("min-w-0 text-sm", strong ? "font-bold text-foreground" : "text-muted-foreground", muted && "text-muted-subtle")}>
        {sign && <span className="mr-1 inline-block w-3 font-bold text-foreground">{sign}</span>}
        {label}
      </span>
      <span className={cn("shrink-0 tabular-nums", strong ? "text-base font-extrabold text-foreground" : "text-sm font-semibold text-foreground")}>
        {sign === "−" ? `−${usd(value)}` : usd(value)}
      </span>
    </div>
  );
}

/**
 * The Client Hub's money, in plain language (0113): the contract math
 * (original + approved changes = current contract) and the payment block
 * (invoiced, received, unpaid invoices, remaining). Everything comes from
 * Feature 2's shared summary via clientProjectMoney().
 */
export function ProjectMoneyBlocks({ detail, docBase }: { detail: PortalProjectDetail; docBase: string }) {
  const { breakdown, summary, unpaidInvoices } = clientProjectMoney(detail);
  if (breakdown.lines.length === 0 && detail.invoices.length === 0 && (detail.payments ?? []).length === 0) return null;
  const overpaid = summary.overpaid > 0.004;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Balances first on a phone — what the client opens the page for. */}
      <section className="card-surface order-1 p-5 md:order-2">
        <h3 className="text-base font-bold text-foreground">Payments</h3>
        <div className="mt-3 rounded-xl bg-primary/10 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {overpaid ? "Credit balance" : "Remaining project balance"}
          </div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
            {usd(overpaid ? summary.overpaid : Math.max(0, summary.remaining))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {overpaid
              ? "You've paid more than the current contract — this credit carries forward."
              : "What's left on your total contract after all payments received."}
          </p>
        </div>
        <div className="mt-2 divide-y divide-hairline">
          <Line label="Amount invoiced" value={summary.invoiced} />
          <Line label="Payments received" value={summary.received} />
          <Line label="Unpaid invoices" value={summary.unpaidInvoiceBalance} />
        </div>
        <p className="text-xs text-muted-subtle">Unpaid invoices are bills you've been sent that haven't been paid in full yet.</p>
        {unpaidInvoices.length > 0 && (
          <ul className="mt-3 space-y-2">
            {unpaidInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{inv.invoice_number ?? "Invoice"}</div>
                  <div className="text-xs text-muted-foreground">
                    {usd(invoiceBalance({ ...inv, status: inv.status as "sent" }))} due
                    {inv.due_date ? ` · by ${historyDate(inv.due_date)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-3 text-sm font-semibold">
                  <Link to={`${docBase}/invoice/${inv.id}`} className="text-primary hover:underline">
                    View
                  </Link>
                  <Link to={`${docBase}/invoice/${inv.id}#pay`} className="text-primary hover:underline">
                    Pay
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface order-2 p-5 md:order-1">
        <h3 className="text-base font-bold text-foreground">Your contract</h3>
        <div className="mt-2">
          {breakdown.lines.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No approved contract yet.</p>
          ) : (
            breakdown.lines.map((l, i) => (
              <Line key={l.id} label={l.label} value={l.amount} sign={i === 0 ? undefined : l.amount < 0 ? "−" : "+"} />
            ))
          )}
          <Line label="Current contract value" value={breakdown.total} sign="=" strong />
        </div>
        <p className="mt-1 text-xs text-muted-subtle">
          Your original quote plus every change you've approved. Pending or declined changes aren't included.
        </p>
      </section>
    </div>
  );
}

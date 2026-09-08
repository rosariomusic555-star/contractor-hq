import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { getSharedInvoice } from "@/lib/api";

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-10">
      <div className="mx-auto max-w-[600px]">{children}</div>
    </div>
  );
}

function CenteredNotice({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

// Append a local midnight so a date-only string ("2026-09-15") isn't parsed
// as UTC midnight, which shifts it back a day in negative-offset timezones.
const formatDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

export default function SharedInvoicePage() {
  const { token = "" } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-invoice", token],
    queryFn: () => getSharedInvoice(token),
    enabled: token.length > 0,
  });

  if (!token || isError) {
    return <CenteredNotice>Invoice not found.</CenteredNotice>;
  }
  if (isLoading) {
    return <CenteredNotice>Loading invoice…</CenteredNotice>;
  }
  if (!data) {
    return <CenteredNotice>Invoice not found.</CenteredNotice>;
  }

  const { invoice, project, client } = data;
  const isPaid = invoice.status === "paid";
  const number = invoice.invoice_number ?? "—";
  const dueDate = formatDate(invoice.due_date);

  return (
    <PageShell>
      <div className="bg-white rounded-xl border border-border/60 shadow-sm p-6 md:p-10 space-y-8">
        {isPaid && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
            <p className="font-semibold text-success">Paid ✓</p>
          </div>
        )}

        <header className="space-y-2">
          <p className="text-sm font-bold tracking-wide text-primary">ContractorPro</p>
          <h1 className="text-2xl font-bold text-foreground [overflow-wrap:anywhere]">
            {project ? `${project.name} — ` : ""}Invoice {number}
          </h1>
          {client?.name && (
            <p className="text-muted-foreground [overflow-wrap:anywhere]">Prepared for {client.name}</p>
          )}
        </header>

        <div className="rounded-xl border border-border bg-muted/40 p-6 space-y-1.5 text-center">
          <p className="text-sm text-muted-foreground">Amount due</p>
          <p className="text-4xl font-bold text-foreground">
            {formatCurrency(Number(invoice.amount))}
          </p>
          {dueDate && <p className="text-sm text-muted-foreground pt-1">Due {dueDate}</p>}
        </div>

        {invoice.notes && (
          <div className="space-y-1.5">
            <h2 className="font-semibold text-foreground">Notes</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {isPaid ? (
          <p className="text-sm text-muted-foreground">
            Paid{" "}
            {invoice.paid_at &&
              `on ${new Date(invoice.paid_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}`}
            . Thank you!
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            To pay by bank transfer, contact your contractor. Online payment coming soon.
          </div>
        )}
      </div>
    </PageShell>
  );
}

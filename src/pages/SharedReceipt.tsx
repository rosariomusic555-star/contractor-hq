import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { getSharedReceipt } from "@/lib/api";
import { paymentMethodLabel } from "@/lib/projectMoney";
import { downloadReceiptPdf, receiptAppliedLines, receiptDate } from "@/lib/receiptPdf";

function CenteredNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-3 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-semibold text-foreground [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

/**
 * Public payment receipt (0111) — /receipt/:token, no login, same token
 * pattern as quotes / invoices. Client-facing only: no cost / profit /
 * margin, no internal note. Voided payments show VOID.
 */
export default function SharedReceiptPage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-receipt", token],
    queryFn: () => getSharedReceipt(token),
    enabled: token.length > 0,
  });

  if (!token || isError) return <CenteredNotice>Receipt not found.</CenteredNotice>;
  if (isLoading) return <CenteredNotice>Loading receipt…</CenteredNotice>;
  if (!data) return <CenteredNotice>Receipt not found.</CenteredNotice>;

  const { receipt, business, client, project } = data;
  const isVoid = receipt.status === "void";
  const contact = [business?.phone, business?.email].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-8 md:py-10">
      <div className="mx-auto max-w-[520px] space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-white p-6 shadow-sm md:p-8">
          {isVoid && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center">
              <p className="font-extrabold tracking-[0.3em] text-destructive">VOID</p>
              <p className="text-xs text-destructive">This payment was voided and is not counted.</p>
            </div>
          )}

          <header className="space-y-1">
            <p className="text-lg font-bold text-foreground [overflow-wrap:anywhere]">{business?.company_name || "Payment receipt"}</p>
            {business?.address && <p className="text-xs text-muted-foreground">{business.address}</p>}
            {contact && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{contact}</p>}
            {business?.license && <p className="text-xs text-muted-foreground">License {business.license}</p>}
          </header>

          <div className="mt-6 flex items-baseline justify-between border-t border-border pt-5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Receipt</span>
            <span className="text-sm font-bold text-foreground">{receipt.number}</span>
          </div>

          <div className="mt-3">
            <p className={cn("text-4xl font-extrabold tracking-tight text-foreground", isVoid && "text-muted-foreground line-through")}>
              {formatCurrency(Number(receipt.amount))}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Received {receiptDate(receipt.paid_on)}</p>
          </div>

          <div className="mt-5">
            {client?.name && <Row label="Client">{client.name}</Row>}
            {project?.name && <Row label="Project">{project.name}</Row>}
            {project?.address && <Row label="Address">{project.address}</Row>}
            <Row label="Method">{paymentMethodLabel(receipt.method)}</Row>
            {receipt.reference && <Row label={receipt.method === "check" ? "Check #" : "Reference"}>{receipt.reference}</Row>}
            <Row label="Applied to">
              {receiptAppliedLines(data).map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </Row>
            {!isVoid && data.remaining_balance != null && (
              <Row label="Remaining project balance">{formatCurrency(Math.max(0, Number(data.remaining_balance)))}</Row>
            )}
          </div>

          {!isVoid && <p className="mt-6 text-sm text-muted-foreground">Thank you for your payment.</p>}
        </div>

        <Button variant="outline" className="w-full bg-white" onClick={() => downloadReceiptPdf(data)}>
          <Download className="mr-1.5 h-4 w-4" />
          Download PDF
        </Button>
      </div>
    </div>
  );
}

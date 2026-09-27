import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, History, MoreHorizontal, Pencil, RotateCcw, Send, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { RecordPaymentSheet } from "@/components/payments/RecordPaymentSheet";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateMoney } from "@/hooks/use-invalidate-money";
import { useAuth } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";
import {
  getSharedReceipt,
  listPaymentEvents,
  logProjectEvent,
  restorePayment,
  voidPayment,
  type Invoice,
  type Payment,
  type PaymentEvent,
} from "@/lib/api";
import { paymentAppliedToLabel, paymentMethodLabel } from "@/lib/projectMoney";
import { downloadReceiptPdf } from "@/lib/receiptPdf";

const shortDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const receiptUrl = (p: Pick<Payment, "share_token">) => `${window.location.origin}/receipt/${p.share_token}`;

/**
 * A project's (or invoice's) payments (0111) — date, amount, method,
 * what it was applied to, and its receipt. Voided payments stay listed,
 * crossed out, and count nowhere. Edit / void / history per row.
 */
export function PaymentsList({
  payments,
  invoices,
  projectId,
  emptyLabel = "No payments yet.",
}: {
  payments: Payment[];
  /** For editing allocations. */
  invoices: Invoice[];
  projectId: string | null;
  emptyLabel?: string;
}) {
  const { toast } = useToast();
  const invalidateMoney = useInvalidateMoney();
  const [editing, setEditing] = useState<Payment | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [history, setHistory] = useState<Payment | null>(null);
  const [sharing, setSharing] = useState<Payment | null>(null);

  const voidMut = useMutation({
    mutationFn: async (p: Payment) => {
      await voidPayment(p.id, voidReason);
      if (p.project_id) {
        void logProjectEvent(p.project_id, "payment_voided", `Payment voided · ${p.receipt_number ?? ""} · ${formatCurrency(Number(p.amount))}`, {
          payment_id: p.id,
        });
      }
    },
    onSuccess: () => {
      invalidateMoney();
      setVoiding(null);
      toast({ title: "Payment voided", description: "It stays in the list, crossed out, and no longer counts." });
    },
    onError: (err: Error) => toast({ title: "Couldn't void payment", description: err.message, variant: "destructive" }),
  });

  const restoreMut = useMutation({
    mutationFn: (p: Payment) => restorePayment(p.id),
    onSuccess: () => {
      invalidateMoney();
      toast({ title: "Payment restored" });
    },
    onError: (err: Error) => toast({ title: "Couldn't restore payment", description: err.message, variant: "destructive" }),
  });

  const downloadPdf = async (p: Payment) => {
    try {
      const r = await getSharedReceipt(p.share_token);
      if (r) downloadReceiptPdf(r);
    } catch (err) {
      toast({ title: "Couldn't build the PDF", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (payments.length === 0) return <p className="py-2 text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <>
      <ul className="divide-y divide-hairline">
        {payments.map((p) => {
          const isVoid = p.status === "void";
          return (
            <li key={p.id} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm font-bold tabular-nums text-foreground", isVoid && "text-muted-foreground line-through")}>
                    {formatCurrency(Number(p.amount))}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{shortDate(p.paid_on)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {isVoid && <span className="badge-status badge-overdue !py-0 text-[10px]">VOID</span>}
                  <span>
                    {paymentMethodLabel(p.method)}
                    {p.reference ? ` #${p.reference}` : ""}
                  </span>
                  <span>·</span>
                  <span className={cn("truncate", isVoid && "line-through")}>{paymentAppliedToLabel(p)}</span>
                  <span>·</span>
                  <a
                    href={receiptUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    {p.receipt_number ?? "Receipt"}
                  </a>
                </div>
                {isVoid && p.void_reason && <p className="mt-0.5 text-[11px] text-muted-subtle">Void: {p.void_reason}</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Payment ${p.receipt_number ?? ""} actions`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={receiptUrl(p)} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> View receipt
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void downloadPdf(p)}>
                    <Download className="mr-2 h-4 w-4" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSharing(p)}>
                    <Send className="mr-2 h-4 w-4" /> Send receipt
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!isVoid && (
                    <DropdownMenuItem onSelect={() => setEditing(p)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setHistory(p)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </DropdownMenuItem>
                  {isVoid ? (
                    <DropdownMenuItem onSelect={() => restoreMut.mutate(p)}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        setVoidReason("");
                        setVoiding(p);
                      }}
                    >
                      <Ban className="mr-2 h-4 w-4" /> Void
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>

      <RecordPaymentSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        projectId={projectId}
        invoices={invoices}
        payment={editing}
      />

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void {voiding?.receipt_number ?? "payment"}?</DialogTitle>
            <DialogDescription>
              {voiding && formatCurrency(Number(voiding.amount))} stops counting everywhere and comes off any invoice it was applied to.
              It stays in the list, crossed out, and its receipt is marked VOID. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea id="void-reason" rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Bounced check, entered twice…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={voidMut.isPending} onClick={() => voiding && voidMut.mutate(voiding)}>
              Void payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentHistoryDialog payment={history} onClose={() => setHistory(null)} />

      {sharing && (
        <ShareLinkDialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)} url={receiptUrl(sharing)} kind="receipt" />
      )}
    </>
  );
}

const FIELD_LABEL: Record<string, string> = {
  amount: "Amount",
  paid_on: "Date",
  method: "Method",
  reference: "Reference",
  note: "Note",
  project_id: "Project",
};

function fmtVal(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "amount") return formatCurrency(Number(v));
  if (field === "method") return paymentMethodLabel(String(v));
  if (field === "paid_on") return shortDate(String(v));
  return String(v);
}

function describeEvent(e: PaymentEvent): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form audit jsonb
  const c = e.changes as Record<string, any>;
  switch (e.action) {
    case "created":
      return `Recorded ${formatCurrency(Number(c.amount))} · ${paymentMethodLabel(c.method)}`;
    case "migrated":
      return `Converted from ${c.invoice ?? "an invoice"} marked paid`;
    case "voided":
      return c.reason ? `Voided — ${c.reason}` : "Voided";
    case "restored":
      return "Restored";
    case "applied":
      return typeof c.amount === "object"
        ? `${c.invoice ?? "Invoice"}: applied ${formatCurrency(Number(c.amount.from))} → ${formatCurrency(Number(c.amount.to))}`
        : `Applied ${formatCurrency(Number(c.amount))} to ${c.invoice ?? "invoice"}`;
    case "unapplied":
      return `Removed ${formatCurrency(Number(c.amount))} from ${c.invoice ?? "invoice"} — back to credit`;
    case "edited":
      return Object.entries(c)
        .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${fmtVal(k, v?.from)} → ${fmtVal(k, v?.to)}`)
        .join(" · ");
  }
}

function PaymentHistoryDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { session } = useAuth();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["payment-events", payment?.id],
    queryFn: () => listPaymentEvents(payment!.id),
    enabled: !!payment,
  });
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>History · {payment?.receipt_number ?? "Payment"}</DialogTitle>
          <DialogDescription>Every change to this payment — nothing is ever deleted.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-semibold text-foreground">{describeEvent(e)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" · "}
                  {e.user_id && e.user_id === session?.user.id ? "You" : e.user_id ? "Team member" : "System"}
                </p>
              </li>
            ))}
            {events.length === 0 && <p className="text-sm text-muted-foreground">No history recorded.</p>}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

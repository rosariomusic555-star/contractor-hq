import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { useToast } from "@/hooks/use-toast";
import { emailOrderSheet, listSuppliers, touchSupplierUsage, updateSupplier } from "@/lib/api";

export interface OrderSheetPdf {
  filename: string;
  url: string;
  base64: string;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * "Email to supplier" step of the Order Sheet dialog: the PDF preview plus
 * an editable To (from the supplier list, or typed), Subject and Message.
 * Sends through the send-supplier-email Edge Function (PDF attached) —
 * which also logs it on the project's activity.
 */
export function EmailOrderSheetStep({
  projectId,
  pdf,
  supplier,
  onSupplierChange,
  defaults,
  onBack,
  onSent,
}: {
  projectId: string;
  pdf: OrderSheetPdf;
  supplier: string;
  onSupplierChange: (name: string) => void;
  defaults: { subject: string; message: string };
  onBack: () => void;
  onSent: (to: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const supplierRow = suppliers.find((s) => s.name.trim().toLowerCase() === supplier.trim().toLowerCase()) ?? null;

  const [to, setTo] = useState(supplierRow?.email ?? "");
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.message);

  // Picking a supplier fills To with their email — unless the contractor has
  // typed a different address themselves.
  const autoTo = useRef(supplierRow?.email ?? "");
  useEffect(() => {
    const next = supplierRow?.email ?? "";
    if (to === autoTo.current) setTo(next);
    autoTo.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierRow?.id, supplierRow?.email]);

  const send = useMutation({
    mutationFn: () =>
      emailOrderSheet({
        projectId,
        to: to.trim(),
        supplierName: supplier.trim() || null,
        subject: subject.trim(),
        message,
        filename: pdf.filename,
        pdfBase64: pdf.base64,
      }),
    onSuccess: async () => {
      // Remember a typed address on the supplier that had none.
      if (supplierRow && !supplierRow.email) await updateSupplier(supplierRow.id, { email: to.trim() }).catch(() => undefined);
      if (supplier.trim()) void touchSupplierUsage(supplier.trim());
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      toast({ title: "Order sheet emailed", description: `Sent to ${to.trim()} with the PDF attached.` });
      onSent(to.trim());
    },
    onError: (err: Error) => toast({ title: "Couldn't send the email", description: err.message, variant: "destructive" }),
  });

  const validTo = EMAIL_RE.test(to.trim());

  return (
    <>
      <DialogHeader className="border-b border-hairline px-5 py-4">
        <DialogTitle>Email to supplier</DialogTitle>
      </DialogHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Preview · {pdf.filename}</Label>
            <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Open full size <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <iframe title="Order sheet preview" src={pdf.url} className="h-[38vh] min-h-[260px] w-full rounded-lg border border-hairline bg-muted/30" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <SupplierCombobox value={supplier} onChange={onSupplierChange} placeholder="Choose supplier…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-email-to">To</Label>
            <Input id="os-email-to" type="email" inputMode="email" autoComplete="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="orders@supplier.com" />
            {supplierRow && !supplierRow.email && (
              <p className="text-xs text-muted-foreground">No email on file for {supplierRow.name} — the one you type is saved to it.</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="os-email-subject">Subject</Label>
          <Input id="os-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="os-email-message">Message</Label>
          <Textarea id="os-email-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={7} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-4">
        <Button variant="ghost" onClick={onBack} disabled={send.isPending}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        <Button onClick={() => send.mutate()} disabled={!validTo || !subject.trim() || send.isPending} className="font-bold">
          <Send className="mr-1.5 h-4 w-4" />
          {send.isPending ? "Sending…" : "Send with PDF"}
        </Button>
      </div>
    </>
  );
}

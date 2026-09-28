import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManualApprovalDialog, type ManualApproval } from "@/components/common/ManualApprovalDialog";
import { useToast } from "@/hooks/use-toast";
import { useRecorderName } from "@/hooks/use-recorder-name";
import { cn } from "@/lib/utils";
import { contractorApproveQuote, type Quote } from "@/lib/api";

const methodText = (m: Quote["approval_method"]) => (m === "in_person" ? "in person" : m === "paper" ? "on paper" : "another way");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/**
 * Quote approval (0133): on an approved quote, who approved it — the client
 * in the Client Hub, or the contractor recording a paper / in-person
 * approval. On a draft or sent quote, "Mark approved" for when the client
 * agreed outside the app — same downstream effects as a Client Hub approval.
 */
export function QuoteApprovalRow({ quote, clientName, disabledReason }: { quote: Quote; clientName: string | null; disabledReason: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const recordedBy = useRecorderName();
  const [open, setOpen] = useState(false);

  const approve = useMutation({
    mutationFn: (a: ManualApproval) =>
      contractorApproveQuote({
        quoteId: quote.id,
        method: a.method,
        note: a.note,
        signedBy: a.signedBy,
        approvedOn: a.approvedOn,
        recordedBy,
      }),
    onSuccess: () => {
      for (const k of ["quotes", "quote", "opportunities", "projects", "project", "invoices", "project-features", "quote-selections"]) qc.invalidateQueries({ queryKey: [k] });
      setOpen(false);
      toast({ title: "Quote approved", description: "The job is Won — same as a client approval in the Client Hub." });
    },
    onError: (e: Error) => toast({ title: "Couldn't approve", description: e.message, variant: "destructive" }),
  });

  if (quote.status === "approved") {
    const manual = !!quote.approved_manually_by;
    return (
      <div className={cn("flex items-start gap-2 rounded-card border px-4 py-3 text-sm", manual ? "border-info/40 bg-info/5" : "border-success/40 bg-success/5")}>
        {manual ? <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-info" /> : <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
        <div>
          <p className="font-semibold text-foreground">
            {manual
              ? `Approved ${methodText(quote.approval_method)}${quote.signed_by ? ` by ${quote.signed_by}` : ""} — recorded by ${quote.approved_manually_by}`
              : `Approved by the client online${quote.signed_by ? ` — signed by ${quote.signed_by}` : ""}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {day(quote.signed_at)}
            {quote.approval_note ? ` · ${quote.approval_note}` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (quote.status !== "draft" && quote.status !== "sent") return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hairline px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">Client agreed in person or on paper?</span>
        <Button variant="outline" className="h-10" disabled={!!disabledReason} title={disabledReason ?? undefined} onClick={() => setOpen(true)}>
          <PenLine className="mr-1.5 h-4 w-4" /> Mark approved
        </Button>
      </div>
      <ManualApprovalDialog
        open={open}
        onOpenChange={setOpen}
        title="Mark this quote approved"
        description="Does everything a client approval does: locks the selections, marks the job Won and schedules it, and drafts the deposit invoice."
        defaultSignedBy={clientName}
        pending={approve.isPending}
        onSubmit={(a) => approve.mutate(a)}
      />
    </>
  );
}

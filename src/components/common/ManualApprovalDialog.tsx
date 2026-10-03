import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

export type ApprovalMethod = "in_person" | "paper" | "other";
export interface ManualApproval {
  method: ApprovalMethod;
  signedBy: string | null;
  /** "2026-10-02" */
  approvedOn: string;
  note: string | null;
}

const METHODS: { value: ApprovalMethod; label: string }[] = [
  { value: "in_person", label: "In person" },
  { value: "paper", label: "Signed on paper" },
  { value: "other", label: "Other" },
];
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * "The client agreed outside the app" — how, who, when, a note. Shared by
 * quotes (0133) and change orders (0139); the caller does the approving.
 */
function ManualApprovalDialogInner({
  open,
  onOpenChange,
  title,
  description,
  defaultSignedBy,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  defaultSignedBy: string | null;
  pending: boolean;
  onSubmit: (a: ManualApproval) => void;
}) {
  const [method, setMethod] = useState<ApprovalMethod>("paper");
  const [signedBy, setSignedBy] = useState(defaultSignedBy ?? "");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setMethod("paper");
    setSignedBy(defaultSignedBy ?? "");
    setDate(todayIso());
    setNote("");
  }, [open, defaultSignedBy]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">How did they approve?</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn("min-h-[44px] rounded-lg border px-2 text-sm font-semibold", method === m.value ? "border-primary bg-primary/10 text-foreground" : "border-hairline text-muted-foreground")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Approved by</span>
            <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Client's name" className="mt-1 h-11" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Date</span>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 w-44" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Note (optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Signed at the site visit, copy in the job folder" />
          </label>
          <Button
            className="h-11 w-full font-bold"
            disabled={!date || pending}
            onClick={() => onSubmit({ method, signedBy: signedBy.trim() || null, approvedOn: date, note: note.trim() || null })}
          >
            {pending ? "Approving…" : "Mark approved"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const ManualApprovalDialog = withErrorBoundary(ManualApprovalDialogInner, "ManualApprovalDialog");

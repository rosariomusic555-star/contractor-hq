import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { priceLabel } from "@/lib/selections";
import { requestPortalSelectionChange, type PortalSelectionGroup } from "@/lib/portalApi";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

/**
 * Client Hub: "Request a change" on an approved selection (0115). Sends a
 * request to the contractor — nothing changes until they send a change
 * order and it's approved.
 */
function RequestSelectionChangeDialogInner({ group, onClose }: { group: PortalSelectionGroup | null; onClose: () => void }) {
  const { toast } = useToast();
  const [optionId, setOptionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => requestPortalSelectionChange(group!.id, optionId, note),
    onSuccess: () => {
      toast({ title: "Request sent", description: "Your contractor will follow up — nothing changes until you approve a change order." });
      setOptionId(null);
      setNote("");
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't send", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a change · {group?.name}</DialogTitle>
          <DialogDescription>Your approved choice stays as is until your contractor sends a change order and you approve it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>What would you like instead? (optional)</Label>
          <div className="grid gap-1.5">
            {group?.options
              .filter((o) => !group.picked.includes(o.id))
              .map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOptionId(optionId === o.id ? null : o.id)}
                  aria-pressed={optionId === o.id}
                  className={cn("flex min-h-11 items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm", optionId === o.id ? "border-primary bg-primary/5" : "border-border")}
                >
                  <span className="font-semibold">{o.name}</span>
                  <span className="text-xs text-muted-foreground">{priceLabel(o.price_delta)}</span>
                </button>
              ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sel-req-note">Note</Label>
          <Textarea id="sel-req-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything your contractor should know?" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={send.isPending || (!optionId && !note.trim())} onClick={() => send.mutate()}>
            {send.isPending ? "Sending…" : "Send request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const RequestSelectionChangeDialog = withErrorBoundary(RequestSelectionChangeDialogInner, "RequestSelectionChangeDialog");

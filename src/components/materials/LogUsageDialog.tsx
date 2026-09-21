import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addUsageLog, uploadUsageLogPhoto, type MaterialsItem } from "@/lib/api";

interface LogUsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The line to log against — the field-mobile flow (project page) picks
   * this first; opened from a sheet row, it's already known. */
  line: Pick<MaterialsItem, "id" | "name" | "unit">;
  onLogged?: () => void;
}

/**
 * Phase 3's "log '6 tons of base' in a few taps" — big tap targets, a
 * numeric-keypad quantity field (inputMode="decimal"), reached identically
 * from a sheet row or the project page's Materials card so there's exactly
 * one usage-logging UI, not two. Quantity is the only required field;
 * everything else (date defaults to today, note/photo/logged-by) is
 * optional and collapses out of the way until touched.
 */
export function LogUsageDialog({ open, onOpenChange, line, onLogged }: LogUsageDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [loggedBy, setLoggedBy] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuantity("");
      setNote("");
      setLoggedBy("");
      setPhoto(null);
      setPhotoPreview(null);
    }
  }, [open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      let photo_path: string | null = null;
      if (photo) photo_path = await uploadUsageLogPhoto(line.id, photo);
      return addUsageLog({
        materials_item_id: line.id,
        quantity: parseFloat(quantity),
        note: note.trim() || null,
        logged_by: loggedBy.trim() || null,
        photo_path,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials-usage-logs"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["materials-sections-all"] });
      toast({ title: `Logged ${quantity} ${line.unit ?? ""} of ${line.name}` });
      onOpenChange(false);
      onLogged?.();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const qty = parseFloat(quantity);
  const canSave = quantity.trim().length > 0 && !Number.isNaN(qty) && qty > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-5">
        <DialogHeader>
          <DialogTitle>Log usage — {line.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-sm">Quantity used</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoFocus
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="h-14 text-2xl font-bold"
            />
            {line.unit && <span className="shrink-0 text-lg font-semibold text-muted-foreground">{line.unit}</span>}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering…" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Logged by (optional)</Label>
          <Input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} placeholder="Crew member's name" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Photo (optional)</Label>
          {photoPreview ? (
            <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-muted">
              <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPhotoPreview(null);
                }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border text-sm font-semibold text-muted-subtle transition-colors hover:border-primary hover:text-primary">
              <Camera className="h-4 w-4" />
              Add a photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPhoto(file);
                  setPhotoPreview(URL.createObjectURL(file));
                }}
              />
            </label>
          )}
        </div>

        <Button
          size="lg"
          className="h-12 w-full font-bold"
          disabled={!canSave || saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Logging…" : "Log usage"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

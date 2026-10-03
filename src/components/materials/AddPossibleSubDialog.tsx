import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_SHEET } from "@/lib/dialogStyles";
import { combinedLineName } from "@/lib/possibleSubs";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

export type AddSubChoice =
  /** One General line for one sub price covering every feature. */
  | { mode: "one"; amount: number }
  /** One Subcontractor line per feature, each with its own amount. */
  | { mode: "split"; amounts: Record<string, number> };

const toAmount = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * "Add as subcontractor line" for a possible sub that serves several
 * features: one General line (default) or split across the features.
 * Amounts are optional — they can be filled in on the lines afterwards.
 */
function AddPossibleSubDialogInner({
  sub,
  features,
  onOpenChange,
  onAdd,
}: {
  /** Null = closed. */
  sub: { label: string } | null;
  /** The item's features still on the job, in order. */
  features: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onAdd: (choice: AddSubChoice) => void;
}) {
  const [mode, setMode] = useState<"one" | "split">("one");
  const [amount, setAmount] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sub) return;
    setMode("one");
    setAmount("");
    setAmounts({});
  }, [sub]);

  const option = (value: "one" | "split", title: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-colors",
        mode === value ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
      )}
    >
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );

  const submit = () =>
    onAdd(
      mode === "one"
        ? { mode: "one", amount: toAmount(amount) }
        : { mode: "split", amounts: Object.fromEntries(features.map((f) => [f.id, toAmount(amounts[f.id] ?? "")])) },
    );

  return (
    <Dialog open={!!sub} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-md gap-4", MOBILE_BOTTOM_SHEET)}>
        <DialogHeader>
          <DialogTitle>Add {sub?.label}</DialogTitle>
          <DialogDescription>It's for {features.map((f) => f.name).join(" and ")}. How should it go in the cost plan?</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" className="space-y-2">
          {option("one", "One line in General", `“${combinedLineName(sub?.label ?? "", features.map((f) => f.name))}”, one subcontractor price covering all of it`)}
          {option("split", "Split across features", "One Subcontractor line on each feature's section, each with its own amount")}
        </div>

        {mode === "one" ? (
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Amount (optional)</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0" className="h-10" />
          </label>
        ) : (
          <div className="space-y-2">
            {features.map((f) => (
              <label key={f.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{f.name}</span>
                <Input
                  inputMode="decimal"
                  value={amounts[f.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [f.id]: e.target.value }))}
                  placeholder="$0 (optional)"
                  aria-label={`${f.name} amount`}
                  className="h-10 w-36"
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{mode === "one" ? "Add line" : `Add ${features.length} lines`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const AddPossibleSubDialog = withErrorBoundary(AddPossibleSubDialogInner, "AddPossibleSubDialog");

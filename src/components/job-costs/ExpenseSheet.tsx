import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Paperclip, Plus, ScanLine, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { FeatureSelect, CostTypeSelect } from "@/components/expenses/FeatureTypeSelects";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import {
  createExpense,
  getSignedImageUrls,
  logProjectEvent,
  saveExpenseLines,
  updateExpense,
  uploadExpenseReceipt,
  type Category,
  type Expense,
  type ExpenseCategory,
} from "@/lib/api";
import type { ProjectFeature } from "@/lib/features";
import { extractReceipt } from "@/lib/assistant";
import { expenseBucket } from "@/lib/costPlan";
import { COST_TYPE_LABEL, type CostBucket } from "@/lib/costPlanMath";
import { parseDecimal } from "@/lib/parseDecimal";
import { isoDate } from "@/lib/weatherRisk";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import type { JobCostReport } from "@/lib/jobCosts";

const NO_CATEGORY = "__none";

interface DraftLine {
  key: string;
  description: string;
  amount: string;
  feature_id: string | null;
  cost_type: CostBucket | null;
}

let seq = 0;
const newKey = () => `l${++seq}`;

/**
 * Add / edit an expense from the job costs view (0151: vendor, notes,
 * receipt photo). "Scan receipt" reads it with the same extraction the
 * material deliveries use (assistant-chat extract_receipt) — vendor, date,
 * total and lines fill the form for review; nothing is saved until Save.
 * The scanned photo is kept as the expense's receipt.
 */
export function ExpenseSheet({
  open,
  onOpenChange,
  projectId,
  editing,
  features,
  categories,
  expenseCategories,
  report,
  defaults,
  scanFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editing: Expense | null;
  /** Active features. */
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  expenseCategories: ExpenseCategory[];
  report: JobCostReport;
  defaults?: { feature_id?: string | null; cost_type?: CostBucket | null };
  /** Opened from "Scan receipt": read this file as soon as it opens. */
  scanFile?: File | null;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [vendor, setVendor] = useState("");
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [costType, setCostType] = useState<CostBucket | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  // Reset whenever it opens.
  useEffect(() => {
    if (!open) return;
    const e = editing;
    setName(e?.name ?? "");
    setAmount(e ? String(e.amount) : "");
    setDate(e?.date ?? isoDate(new Date()));
    setVendor(e?.vendor ?? "");
    setFeatureId(e ? (e.feature_id ?? null) : (defaults?.feature_id ?? null));
    setCostType(e ? (e.cost_type ?? null) : (defaults?.cost_type ?? null));
    setCategoryId(e?.expense_category_id ?? null);
    setNotes(e?.notes ?? "");
    setLines(
      (e?.expense_lines ?? []).length > 1
        ? e!.expense_lines!.map((l) => ({
            key: newKey(),
            description: l.description ?? "",
            amount: String(l.amount),
            feature_id: l.feature_id ?? null,
            cost_type: l.cost_type ?? null,
          }))
        : [],
    );
    setReceiptFile(null);
    setReceiptPath(e?.receipt_path ?? null);
    setScanNote(null);
  }, [open, editing, defaults?.feature_id, defaults?.cost_type]);
  useEffect(() => {
    if (open && scanFile) void scan(scanFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanFile]);

  const localPreview = receiptFile ? URL.createObjectURL(receiptFile) : null;
  useEffect(() => () => void (localPreview && URL.revokeObjectURL(localPreview)), [localPreview]);
  const { data: signed = {} } = useQuery({
    queryKey: ["expense-receipt-url", receiptPath],
    queryFn: () => getSignedImageUrls([receiptPath!]),
    enabled: !!receiptPath && !receiptFile,
  });
  const preview = localPreview ?? (receiptPath ? signed[receiptPath] : null);

  const split = lines.length > 1;
  const linesTotal = lines.reduce((s, l) => s + (parseDecimal(l.amount) ?? 0), 0);
  const amountValue = split ? Math.round(linesTotal * 100) / 100 : parseDecimal(amount);
  const categoryType = categoryId ? expenseBucket(categoryId, expenseCategories) : null;
  const effectiveType: CostBucket = costType ?? categoryType ?? "other";

  const budgetHint = (fid: string | null, type: CostBucket) => {
    const b = report.remainingBudget(fid, type);
    const where = fid ? (features.find((f) => f.id === fid) ? "this feature" : "General") : "General";
    if (b.planned <= 0) return `No ${COST_TYPE_LABEL[type].toLowerCase()} planned for ${where}`;
    return b.remaining >= 0
      ? `${formatCurrency(b.remaining)} left of ${formatCurrency(b.planned)} planned ${COST_TYPE_LABEL[type].toLowerCase()} (${where})`
      : `${formatCurrency(-b.remaining)} over the ${formatCurrency(b.planned)} planned (${where})`;
  };

  const scan = async (file: File) => {
    setScanning(true);
    setScanNote(null);
    setReceiptFile(file.type.startsWith("image/") ? file : null);
    try {
      const r = await extractReceipt(file);
      if (r.supplier) {
        setVendor(r.supplier);
        if (!name.trim()) setName(`${r.supplier} receipt`);
      }
      if (r.date) setDate(r.date);
      if (r.total != null) setAmount(String(r.total));
      const priced = r.lines.filter((l) => l.unit_price != null || l.quantity != null);
      if (priced.length > 1) {
        setLines(
          priced.map((l) => ({
            key: newKey(),
            description: l.description,
            amount: String(Math.round((Number(l.quantity ?? 1) * Number(l.unit_price ?? 0)) * 100) / 100),
            feature_id: featureId,
            cost_type: costType ?? "material",
          })),
        );
        setScanNote(`Read ${pluralize(priced.length, "line")} — check them, and pick a feature / type per line if they differ. Or remove the lines to keep one total.`);
      } else {
        setScanNote("Read the receipt — check the details before saving.");
      }
    } catch (e) {
      setScanNote(`Couldn't read that receipt (${e instanceof Error ? e.message : "error"}). Fill it in by hand.`);
    } finally {
      setScanning(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give it a name.");
      if (amountValue == null || amountValue <= 0) throw new Error("Enter an amount.");
      let path = receiptPath;
      if (receiptFile) path = await uploadExpenseReceipt(projectId, receiptFile);
      const fields = {
        name: name.trim(),
        amount: amountValue,
        date,
        vendor: vendor.trim() || null,
        notes: notes.trim() || null,
        receipt_path: path,
        expense_category_id: split ? null : categoryId,
        feature_id: split ? null : featureId,
        cost_type: split ? null : costType,
      };
      let id = editing?.id;
      if (editing) await updateExpense(editing.id, fields);
      else {
        const created = await createExpense({ project_id: projectId, ...fields });
        id = created.id;
        await logProjectEvent(projectId, "expense_logged", `Expense logged: ${fields.name} · ${formatCurrency(fields.amount)}`).catch(() => undefined);
      }
      const hadSplit = (editing?.expense_lines ?? []).length > 1;
      if (split || hadSplit) {
        await saveExpenseLines(
          id!,
          split
            ? lines.map((l) => ({
                expense_category_id: categoryId,
                amount: parseDecimal(l.amount) ?? 0,
                description: l.description.trim() || null,
                feature_id: l.feature_id,
                cost_type: l.cost_type,
              }))
            : // Back to one total: the single line carries its category / feature / type.
              [{ expense_category_id: categoryId, amount: amountValue, description: null, feature_id: featureId, cost_type: costType }],
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      toast({ title: editing ? "Expense updated" : "Expense added" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const setLine = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("overflow-y-auto", isMobile ? "max-h-[92dvh] rounded-t-2xl px-4 pb-6 pt-5" : "w-full sm:max-w-lg")}
      >
        <SheetHeader className="text-left">
          <SheetTitle>{editing ? "Edit expense" : "Add expense"}</SheetTitle>
          <SheetDescription>Internal — clients and crew never see costs.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => scanInput.current?.click()} disabled={scanning}>
              {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1.5 h-4 w-4" />}
              {scanning ? "Reading…" : "Scan receipt"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => photoInput.current?.click()}>
              {isMobile ? <Camera className="mr-1.5 h-4 w-4" /> : <Paperclip className="mr-1.5 h-4 w-4" />}
              {preview ? "Replace photo" : "Attach receipt"}
            </Button>
            {/* capture → phone camera; desktop gets a file picker (photo or PDF to scan). */}
            <input ref={scanInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
            <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setReceiptFile(f); }} />
          </div>
          {scanNote && <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-foreground">{scanNote}</p>}
          {preview && (
            <div className="relative w-fit">
              <img src={preview} alt="Receipt" className="h-28 rounded-lg border border-border object-cover" />
              <button type="button" aria-label="Remove receipt" onClick={() => { setReceiptFile(null); setReceiptPath(null); }} className="absolute -right-2 -top-2 rounded-full bg-foreground p-1 text-background">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="exp-name">What was it</Label>
            <Input id="exp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Polymeric sand, dumpster, permit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={split ? String(amountValue ?? "") : amount}
                disabled={split}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <SupplierCombobox value={vendor} onChange={setVendor} placeholder="Who was it paid to?" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId ?? NO_CATEGORY} onValueChange={(v) => setCategoryId(v === NO_CATEGORY ? null : v)}>
              <SelectTrigger className="h-10" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!split && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Feature</Label>
                <FeatureSelect value={featureId} onChange={setFeatureId} features={features} categories={categories} />
              </div>
              <div className="space-y-1.5">
                <Label>Cost type</Label>
                <CostTypeSelect value={costType} onChange={setCostType} categoryType={categoryType} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">{budgetHint(featureId, effectiveType)}</p>
            </div>
          )}

          {split && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lines · {formatCurrency(linesTotal)}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setLines([])}>
                  Keep one total
                </Button>
              </div>
              {lines.map((l) => (
                <div key={l.key} className="space-y-2 rounded-lg border border-border p-2.5">
                  <div className="flex gap-2">
                    <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Line" className="h-9" />
                    <Input value={l.amount} inputMode="decimal" onChange={(e) => setLine(l.key, { amount: e.target.value })} className="h-9 w-28" aria-label="Line amount" />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FeatureSelect value={l.feature_id} onChange={(v) => setLine(l.key, { feature_id: v })} features={features} categories={categories} className="h-9" />
                    <CostTypeSelect value={l.cost_type} onChange={(v) => setLine(l.key, { cost_type: v })} categoryType={categoryType} className="h-9" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{budgetHint(l.feature_id, l.cost_type ?? categoryType ?? "other")}</p>
                </div>
              ))}
            </div>
          )}
          {!split && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-primary"
              onClick={() => {
                const total = parseDecimal(amount) ?? 0;
                setLines([
                  { key: newKey(), description: name, amount: String(total), feature_id: featureId, cost_type: costType },
                  { key: newKey(), description: "", amount: "0", feature_id: null, cost_type: costType },
                ]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Split across features / types
            </button>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal note (optional)" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1 font-bold" disabled={save.isPending || scanning} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : editing ? "Save" : "Add expense"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

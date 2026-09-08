import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  createInvoice,
  logProjectEvent,
  pickHeadlineQuote,
} from "@/lib/api";

const NONE = "__none__";

/** Standalone invoice creation (/invoices/new) — amount/due date/notes and
 * an optional project link, then hands off to the invoice detail view
 * (/invoices/:invoiceId) to send it. */
export function InvoiceNewView() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [projectId, setProjectId] = useState(NONE);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createMut = useMutation({
    mutationFn: async () => {
      const linkedProject = projectId === NONE ? null : projectId;
      let quoteId: string | null = null;
      if (linkedProject) {
        quoteId = pickHeadlineQuote(await listQuotes(linkedProject))?.id ?? null;
      }
      return createInvoice({
        project_id: linkedProject,
        quote_id: quoteId,
        amount: parseFloat(amount) || 0,
        due_date: dueDate || null,
        notes: notes || null,
      });
    },
    onSuccess: (invoice) => {
      void logProjectEvent(
        invoice.project_id,
        "invoice_created",
        `${invoice.invoice_number ?? "Invoice"} drafted · ${formatCurrency(Number(invoice.amount))}`,
        { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
      );
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canSave = amount.trim().length > 0 && !Number.isNaN(parseFloat(amount));

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <Link
        to="/invoices"
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Invoices
      </Link>

      <h1 className="text-[28px] font-bold tracking-tight text-foreground">New invoice</h1>

      <div className="card-surface space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="invoice-amount">Amount</Label>
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="invoice-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pl-6"
            />
          </div>
        </div>

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="invoice-due">Due date</Label>
          <Input
            id="invoice-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Link to project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Optional.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoice-notes">Notes</Label>
          <Textarea
            id="invoice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Progress payment — foundation complete"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => createMut.mutate()}
          disabled={!canSave || createMut.isPending}
          className="font-bold"
        >
          {createMut.isPending ? "Creating…" : "Create invoice"}
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  getProject,
  listQuotes,
  listInvoices,
  createQuote,
  updateQuote,
  deleteQuote,
  addQuoteItem,
  deleteQuoteItem,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generateShareLink,
  revokeShareLink,
  quoteTotal,
  type QuoteStatus,
  type InvoiceStatus,
} from "@/lib/api";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const quoteStatuses: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];
const invoiceStatuses: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];

export function ProjectDetailView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const { data: project, isLoading, isError, error } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => getProject(id),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", { project: id }],
    queryFn: () => listQuotes(id),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", { project: id }],
    queryFn: () => listInvoices(id),
  });

  const createQuoteMut = useMutation({ mutationFn: () => createQuote(id), onSuccess, onError });
  const updateQuoteMut = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateQuote>[1] }) =>
      updateQuote(v.id, v.patch),
    onSuccess,
    onError,
  });
  const deleteQuoteMut = useMutation({ mutationFn: deleteQuote, onSuccess, onError });
  const addItemMut = useMutation({
    mutationFn: (v: { sectionId: string; name: string; price: number }) =>
      addQuoteItem(v.sectionId, { name: v.name, price: v.price }),
    onSuccess,
    onError,
  });
  const deleteItemMut = useMutation({ mutationFn: deleteQuoteItem, onSuccess, onError });
  const createInvoiceMut = useMutation({
    mutationFn: (v: { amount: number; due_date: string | null }) =>
      createInvoice({ project_id: id, amount: v.amount, due_date: v.due_date }),
    onSuccess,
    onError,
  });
  const updateInvoiceMut = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateInvoice>[1] }) =>
      updateInvoice(v.id, v.patch),
    onSuccess,
    onError,
  });
  const deleteInvoiceMut = useMutation({ mutationFn: deleteInvoice, onSuccess, onError });
  const shareMut = useMutation({
    mutationFn: async (v: { action: "generate" | "revoke"; quoteId: string }) => {
      if (v.action === "revoke") return revokeShareLink("quotes", v.quoteId);
      const token = await generateShareLink("quotes", v.quoteId);
      try {
        await navigator.clipboard?.writeText(`${window.location.origin}/share/quote/${token}`);
        toast({ title: "Share link copied to clipboard" });
      } catch {
        toast({ title: "Share link created", description: `${window.location.origin}/share/quote/${token}` });
      }
    },
    onSuccess,
    onError,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading project…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load project: {(error as Error)?.message}</p>;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
        <p className="text-muted-foreground mt-1">
          {project.client?.name ?? "No client"} · {project.status}
        </p>
      </div>

      {/* Quote */}
      <section className="stat-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Quote</h2>
          {quotes.length === 0 && (
            <Button size="sm" onClick={() => createQuoteMut.mutate()}>
              <Plus className="w-4 h-4 mr-2" />
              Create quote
            </Button>
          )}
        </div>

        {quotes.map((quote) => {
          const total = quoteTotal(quote.quote_sections);
          const deposit = (total * Number(quote.deposit_percentage)) / 100;
          return (
            <div
              key={quote.id}
              className="space-y-4 border-t border-border pt-4 first:border-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={quote.status}
                  onValueChange={(v) =>
                    updateQuoteMut.mutate({ id: quote.id, patch: { status: v as QuoteStatus } })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quoteStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`dep-${quote.id}`} className="text-sm text-muted-foreground">
                    Deposit %
                  </Label>
                  <Input
                    id={`dep-${quote.id}`}
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={quote.deposit_percentage}
                    className="w-20"
                    onBlur={(e) =>
                      updateQuoteMut.mutate({
                        id: quote.id,
                        patch: { deposit_percentage: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {quote.share_token ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareMut.mutate({ action: "revoke", quoteId: quote.id })}
                    >
                      <Link2Off className="w-4 h-4 mr-2" />
                      Revoke link
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => shareMut.mutate({ action: "generate", quoteId: quote.id })}
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      Share link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteQuoteMut.mutate(quote.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {quote.quote_sections.map((section) => (
                <div key={section.id} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {section.name}
                    {section.is_optional && (
                      <span className="ml-2 badge-status badge-draft">optional</span>
                    )}
                  </p>
                  <div className="space-y-1">
                    {section.quote_items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1">
                        <span>
                          {item.name}
                          {item.is_optional && " (optional)"}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-medium">{money(Number(item.price))}</span>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => deleteItemMut.mutate(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <AddItemRow
                    onAdd={(name, price) =>
                      addItemMut.mutate({ sectionId: section.id, name, price })
                    }
                  />
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">
                  Deposit ({quote.deposit_percentage}%)
                </span>
                <span>{money(deposit)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`notes-${quote.id}`}>Notes</Label>
                <Textarea
                  id={`notes-${quote.id}`}
                  defaultValue={quote.notes ?? ""}
                  placeholder="Timeline, scope caveats, etc."
                  onBlur={(e) =>
                    updateQuoteMut.mutate({
                      id: quote.id,
                      patch: { notes: e.target.value || null },
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Invoices */}
      <section className="stat-card space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Invoices</h2>
        <div className="space-y-1">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm py-1.5">
              <span className="flex items-center gap-3">
                <span className="font-medium">{money(Number(inv.amount))}</span>
                <Select
                  value={inv.status}
                  onValueChange={(v) =>
                    updateInvoiceMut.mutate({ id: inv.id, patch: { status: v as InvoiceStatus } })
                  }
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invoiceStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span>Due {inv.due_date ?? "—"}</span>
                <button
                  className="hover:text-destructive"
                  onClick={() => deleteInvoiceMut.mutate(inv.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          ))}
          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">No invoices for this project.</p>
          )}
        </div>
        <NewInvoiceRow onAdd={(amount, due) => createInvoiceMut.mutate({ amount, due_date: due })} />
      </section>

      {/* Materials */}
      <section className="stat-card">
        <h2 className="text-lg font-semibold text-foreground">Materials sheet</h2>
        <p className="text-sm text-muted-foreground mt-2">Coming in the next update.</p>
      </section>
    </div>
  );
}

function AddItemRow({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <form
      className="flex gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name) return;
        onAdd(name, parseFloat(price) || 0);
        setName("");
        setPrice("");
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Line item"
        className="h-8"
      />
      <Input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        type="number"
        min="0"
        step="0.01"
        placeholder="0.00"
        className="h-8 w-28"
      />
      <Button type="submit" size="sm" variant="outline" className="h-8">
        Add
      </Button>
    </form>
  );
}

function NewInvoiceRow({ onAdd }: { onAdd: (amount: number, due: string | null) => void }) {
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const value = parseFloat(amount);
        if (!Number.isFinite(value)) return;
        onAdd(value, due || null);
        setAmount("");
        setDue("");
      }}
    >
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        className="h-8 w-32"
      />
      <Input value={due} onChange={(e) => setDue(e.target.value)} type="date" className="h-8 w-40" />
      <Button type="submit" size="sm" variant="outline" className="h-8">
        <Plus className="w-4 h-4 mr-1" />
        Invoice
      </Button>
    </form>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceModal } from "@/components/modals/InvoiceModal";
import { useToast } from "@/hooks/use-toast";
import { listInvoices, createInvoice, deleteInvoice, type InvoiceStatus } from "@/lib/api";

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-pending",
  paid: "badge-status badge-paid",
  overdue: "badge-status badge-overdue",
};

export function InvoicesView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading, isError, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: listInvoices,
  });

  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't create invoice", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete invoice", description: err.message, variant: "destructive" }),
  });

  const filteredInvoices = invoices.filter((invoice) => {
    const term = searchTerm.toLowerCase();
    return (
      invoice.client.toLowerCase().includes(term) ||
      (invoice.project ?? "").toLowerCase().includes(term) ||
      invoice.number.toLowerCase().includes(term)
    );
  });

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Outstanding: <span className="font-semibold text-foreground">${totalOutstanding.toLocaleString()}</span>
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search invoices..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading invoices…</p>}
      {isError && (
        <p className="text-destructive">Failed to load invoices: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{invoice.number}</p>
                    <p className="text-sm text-muted-foreground">{invoice.client}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusStyles[invoice.status]}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                        <DropdownMenuItem><Send className="w-4 h-4 mr-2" />Send</DropdownMenuItem>
                        <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(invoice.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{invoice.project}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due {invoice.due_date ?? "—"}</span>
                  <span className="font-bold text-lg">${invoice.amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {filteredInvoices.length === 0 && (
              <p className="text-muted-foreground text-sm">No invoices yet.</p>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block stat-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="bg-muted/50">
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Project</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Due Date</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="font-medium">{invoice.number}</td>
                      <td>{invoice.client}</td>
                      <td className="text-muted-foreground">{invoice.project}</td>
                      <td className="font-semibold">${invoice.amount.toLocaleString()}</td>
                      <td>
                        <span className={statusStyles[invoice.status]}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td className="text-muted-foreground">{invoice.issue_date}</td>
                      <td className="text-muted-foreground">{invoice.due_date ?? "—"}</td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                            <DropdownMenuItem><Send className="w-4 h-4 mr-2" />Send</DropdownMenuItem>
                            <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(invoice.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-muted-foreground text-center py-8">
                        No invoices yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <InvoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}

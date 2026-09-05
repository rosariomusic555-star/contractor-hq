import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { listInvoices, deleteInvoice, type InvoiceStatus } from "@/lib/api";

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-pending",
  paid: "badge-status badge-paid",
  overdue: "badge-status badge-overdue",
};

export function InvoicesView() {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: invoices = [], isLoading, isError, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete invoice", description: err.message, variant: "destructive" }),
  });

  const filtered = invoices.filter((invoice) => {
    const term = searchTerm.toLowerCase();
    return (
      (invoice.project?.name ?? "").toLowerCase().includes(term) ||
      (invoice.project?.client?.name ?? "").toLowerCase().includes(term)
    );
  });

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Outstanding:{" "}
            <span className="font-semibold text-foreground">
              ${totalOutstanding.toLocaleString()}
            </span>
          </p>
        </div>
        <Button
          onClick={() => navigate("/invoices/new")}
          className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

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
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="bg-muted/50">
                  <th>Project</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                  >
                    <td className="font-medium">{invoice.project?.name ?? "—"}</td>
                    <td className="text-muted-foreground">
                      {invoice.project?.client?.name ?? "—"}
                    </td>
                    <td className="font-semibold">${Number(invoice.amount).toLocaleString()}</td>
                    <td>
                      <span className={statusStyles[invoice.status]}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{invoice.due_date ?? "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {invoice.project_id && (
                            <DropdownMenuItem
                              onClick={() => navigate(`/projects/${invoice.project_id}`)}
                            >
                              Open project
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(invoice.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground text-center py-8">
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

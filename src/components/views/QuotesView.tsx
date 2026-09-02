import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuoteModal } from "@/components/modals/QuoteModal";
import { useToast } from "@/hooks/use-toast";
import { listQuotes, createQuote, deleteQuote, type QuoteStatus } from "@/lib/api";

const statusStyles: Record<QuoteStatus, string> = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-pending",
  approved: "badge-status badge-paid",
  rejected: "badge-status badge-overdue",
};

export function QuotesView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quotes = [], isLoading, isError, error } = useQuery({
    queryKey: ["quotes"],
    queryFn: listQuotes,
  });

  const createMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete quote", description: err.message, variant: "destructive" }),
  });

  const filteredQuotes = quotes.filter((quote) => {
    const term = searchTerm.toLowerCase();
    return (
      quote.client.toLowerCase().includes(term) ||
      (quote.project ?? "").toLowerCase().includes(term) ||
      quote.number.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">Create and manage project quotes</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search quotes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && <p className="text-muted-foreground">Loading quotes…</p>}
      {isError && (
        <p className="text-destructive">Failed to load quotes: {(error as Error).message}</p>
      )}

      {!isLoading && !isError && (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredQuotes.map((quote) => (
              <div key={quote.id} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{quote.number}</p>
                    <p className="text-sm text-muted-foreground">{quote.client}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusStyles[quote.status]}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                        <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(quote.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{quote.project}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valid until {quote.valid_until ?? "—"}</span>
                  <span className="font-bold text-lg">${quote.amount.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {filteredQuotes.length === 0 && (
              <p className="text-muted-foreground text-sm">No quotes yet.</p>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block stat-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="bg-muted/50">
                    <th>Quote #</th>
                    <th>Client</th>
                    <th>Project</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Valid Until</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.id}>
                      <td className="font-medium">{quote.number}</td>
                      <td>{quote.client}</td>
                      <td className="text-muted-foreground">{quote.project}</td>
                      <td className="font-semibold">${quote.amount.toLocaleString()}</td>
                      <td>
                        <span className={statusStyles[quote.status]}>
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </span>
                      </td>
                      <td className="text-muted-foreground">{quote.issue_date}</td>
                      <td className="text-muted-foreground">{quote.valid_until ?? "—"}</td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="w-4 h-4 mr-2" />View</DropdownMenuItem>
                            <DropdownMenuItem><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(quote.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filteredQuotes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-muted-foreground text-center py-8">
                        No quotes yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <QuoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}

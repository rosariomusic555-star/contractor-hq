import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { listQuotes, deleteQuote, quoteTotal, type QuoteStatus } from "@/lib/api";

const statusStyles: Record<QuoteStatus, string> = {
  draft: "badge-status badge-draft",
  sent: "badge-status badge-info",
  approved: "badge-status badge-paid",
};

export function QuotesView() {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: quotes = [], isLoading, isError, error } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => listQuotes(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) =>
      toast({ title: "Couldn't delete quote", description: err.message, variant: "destructive" }),
  });

  const filtered = quotes.filter((quote) => {
    const term = searchTerm.toLowerCase();
    return (
      (quote.project?.name ?? "").toLowerCase().includes(term) ||
      (quote.project?.client?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quotes</h1>
        <p className="text-muted-foreground mt-1">
          Quotes across all projects. Create one from a project.
        </p>
      </div>

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
        <div className="stat-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="bg-muted/50">
                  <th>Project</th>
                  <th>Client</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((quote) => (
                  <tr
                    key={quote.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/quotes/${quote.id}`)}
                  >
                    <td className="font-medium">{quote.project?.name ?? "—"}</td>
                    <td className="text-muted-foreground">{quote.project?.client?.name ?? "—"}</td>
                    <td className="font-semibold">
                      ${Math.round(quoteTotal(quote.quote_sections)).toLocaleString()}
                    </td>
                    <td>
                      <span className={statusStyles[quote.status]}>
                        {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{quote.updated_at.slice(0, 10)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/projects/${quote.project_id}`)}>
                            Open project
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(quote.id)}
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
                      No quotes yet.
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

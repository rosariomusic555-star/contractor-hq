import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { getProject, listQuotes, createQuote, quoteTotal, type QuoteStatus } from "@/lib/api";

const STATUS_META: Record<QuoteStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "badge-status badge-draft" },
  sent: { label: "Sent", badge: "badge-status badge-info" },
  approved: { label: "Approved", badge: "badge-status badge-paid" },
};

export function ProjectQuotesView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: quotes = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["quotes", { project: id }],
    queryFn: () => listQuotes(id),
  });

  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  // Auto-populate the client from the project, if it has one — the
  // contractor can still change it inside the quote builder.
  const addMut = useMutation({
    mutationFn: () => createQuote({ project_id: id, client_id: project?.client_id ?? null }),
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ["quotes", { project: id }] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${id}/quotes/${quote.id}`);
    },
    onError,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading quotes…</p>;
  if (isError || !project)
    return <p className="text-destructive">Failed to load quotes: {(error as Error)?.message}</p>;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">{project.name}</p>
        </div>
        <Button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending}
          className="font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add quote
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No quotes yet. Add your first quote.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => {
            const meta = STATUS_META[quote.status];
            return (
              <div
                key={quote.id}
                className="stat-card flex flex-wrap items-center justify-between gap-3"
              >
                <span className="font-semibold text-foreground">
                  {formatCurrency(quoteTotal(quote.quote_sections))}
                </span>
                <div className="flex items-center gap-4 shrink-0">
                  <span className={meta.badge}>{meta.label}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/projects/${id}/quotes/${quote.id}`)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
